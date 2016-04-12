#!/usr/bin/env python

import argparse
import logging
import urllib2
import json
import re
import operator
import os
import string
import sys
import time
import tempfile
import numpy as np
from PIL import Image

USER_AGENT='Mozilla/5.0 Geodynamics Liberation Front imgdl 0.3'
HOST="api.reddit.com"

LOG = logging.getLogger(os.path.basename(sys.argv[0])) if __name__ == "__main__" else logging.getLogger(__name__)
LOG.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")


def get_request(url):
    req=urllib2.Request(url)
    req.add_header('User-Agent',USER_AGENT)
    return req

def get_subreddit(subreddit,tab="hot"):
    LOG.debug('Getting subreddit "%s"',subreddit)
    url='http://%s/r/%s'%(HOST,subreddit)
    LOG.debug('Subreddit url "%s"',url)
    req=get_request(url)
    req.add_header('User-Agent',USER_AGENT)
    resp=urllib2.urlopen(req)
    doc=json.loads(resp.read())
    assert doc['kind']==u'Listing'
    items=[c['data'] for c in doc['data']['children']]
    LOG.debug('Returning %d items',len(items))
    return items

def comment_url(subreddit,article):
   return "http://www.reddit.com/r/%s/comments/%s/"%(subreddit,article)

def get_downloader(item):
    for regex,downloader in downloaders:
        if not regex.match(item['url']):
            downloader=None
        else:
            LOG.debug("URL %s matches pattern %s, returning downloader %s",item['url'],regex.pattern,downloader.__name__)
            break
    return downloader

def jpeg_dl(url):
    req=get_request(url)
    resp=urllib2.urlopen(req)
    if resp.headers['content-type']!='image/jpeg':
        LOG.warning('Unexpected content-type, %s, expected image/jpeg',resp.headers['content-type'])
        raise TypeError('Unexpected content-type, %s, expected image/jpeg'%resp.headers['content-type'])
    
    f=tempfile.TemporaryFile()
    f.write(resp.read())
    f.seek(0)
    return f

def imgur_dl(url):
    return jpeg_dl(url+'.jpg')

# Regular expressions to match URLS    
re_jpeg=re.compile('.*\.jpe?g$',re.I) # ends in jpg or jpeg ignoring case
re_imgur=re.compile('^http://imgur.com/.*(?<!\.jpg)(?<!\.jpeg)$',re.I) # matches imgur if it doesn't end with jpg or jpeg, ignoring case

downloaders=[
(re_jpeg, jpeg_dl),
(re_imgur, imgur_dl)]

def get_image(filters,subreddit,tab="hot"):
    items=get_subreddit(subreddit,tab)
    downloader=None
    for item in items:
        downloader=get_downloader(item)
        if downloader:
            try:
                f=downloader(item['url'])
                im=Image.open(f)
                result=True
                LOG.debug("Checking %s",item['url'])
                for filter in filters:
                    if filter(im):
                        LOG.debug("%s: PASSED",filter.__class__.__name__)
                    else:
                        LOG.debug("%s: FAILED",filter.__class__.__name__)
                        result=False
                        break
                if result:
                    return item,im
            except (KeyboardInterrupt, SystemExit):
                raise
            except:
                LOG.exception("Exception processing %s"%item['url'])
            finally:
                f.close()

REC708=np.array([0.2126,0.7152,0.0722])
CCIR601=np.array([0.299,0.587,0.114])
def luma(im,coeffs=REC708):
	return np.dot(np.average(np.array(im.getdata()),0),coeffs)

class LumaFilter(object):
    def __init__(self,threshold,op,coeffs=REC708):
        self.threshold=threshold
        self.op=op
        self.coeffs=REC708

    def __call__(self,im):
        l=luma(im,self.coeffs)
        result=self.op(l,self.threshold)
        LOG.debug('luma: %s(%0.1f,%0.1f)=%s',self.op.__name__,l,self.threshold,result)
        return result

class SizeFilter(object):
    def __init__(self,max_w=sys.maxint,max_h=sys.maxint,min_w=0,min_h=0):
        self.max_w=max_w
        self.max_h=max_h
        self.min_w=min_w
        self.min_h=min_h

    def __call__(self,im):
        w=im.size[0]
        h=im.size[1]
        max_w=self.max_w
        max_h=self.max_h
        min_w=self.min_w
        min_h=self.min_h
        result=w<=max_w and w>=min_w and h<=max_h and h>=min_h
        LOG.debug('size(%(w)d,%(h)d): %(w)d<=%(max_w)d and %(w)d>=%(min_w)d and %(h)d<=%(max_h)d and %(h)d>=%(min_h)d = %(result)s',locals())
        return result

class AspectRatioFilter(object):
    def __init__(self,min=0,max=sys.maxint):
        self.min=min
        self.max=max

    def __call__(self,im):
        w=im.size[0]
        h=im.size[1]
        aspect_ratio=float(w)/float(h)
        min_ar=self.min
        max_ar=self.max
        result=aspect_ratio>=min_ar and aspect_ratio<=max_ar
        LOG.debug('aspect_ratio(%(aspect_ratio)0.2f): %(w)d:%(h)d>=%(min_ar)d and %(w)d:%(h)d<=%(max_ar)d = %(result)s',locals())
        return result
        

class FilterGenerator(object):
    def __init__(self,funcs,args=[],kwargs={}):
        self._iterator=funcs.__iter__()
        self.args=args
        self.kwargs=kwargs

    def __iter__(self):
        return self

    def __next__(self):
        return self.next()

    def next(self):
        return self._iterator.next().__call__(*self.args,**self.kwargs)

def save_data(filename,data_function):
    if os.path.exists(filename): os.unlink(filename)
    LOG.debug("Saving data to %s",filename)
    file=open(filename,'wb')
    data_function(file)
    file.close()

if __name__ == "__main__":
    # Set up the screen handler for errors
    screen_handler=logging.StreamHandler()
    screen_handler.setFormatter(formatter)
    screen_handler.setLevel(logging.ERROR)
    LOG.addHandler(screen_handler)

    parser = argparse.ArgumentParser('Downloads image from reddit matching the given criteria.',formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument('-v',dest='verbose',action='store_true',help='Verbose output')
    parser.add_argument('--log',dest='log',metavar='LOG_FILE',default=None,help='Log file')
    parser.add_argument('--luma','-l',dest='luma',type=float,default=90.0,help='Maximum average luma of the image')
    parser.add_argument('--size','-s',dest='size',metavar="WxH",default="1920x1080",help='Minimum size of the image')
    parser.add_argument('--aspect_ratio','-a',dest='aspect_ratio',metavar="W:H",default="2:1",help='Maximum aspect ratio')
    parser.add_argument('--subreddit',dest='subreddit',default="EarthPorn",help='Subreddit to download image from')
    parser.add_argument('--tab',dest='tab',default="hot",help='Tab to download image from')
    parser.add_argument('--template',dest='template',default="template.css",help='CSS Template to process')
    parser.add_argument('file',metavar='FILE',nargs="?",default="%Y.%m.%d",help='Filename (without extension) to save data as, you can use a strftime style pattern')
    args=parser.parse_args()
    w,h=[int(n) for n in re.split('\D+',args.size)]
    aspect_ratio=operator.div(*[float(f) for f in re.split('\D+',args.aspect_ratio)])

    if args.verbose:
        screen_handler.setLevel(logging.DEBUG)
        LOG.setLevel(logging.DEBUG)

    if args.log!=None:
        file_handler=logging.FileHandler(args.log)
        file_handler.setFormatter(formatter)
        file_handler.setLevel(logging.DEBUG)
        LOG.addHandler(file_handler)
        LOG.setLevel(logging.DEBUG)

# Select the image
    filters=[
        LumaFilter(args.luma,operator.lt),
        SizeFilter(min_w=w,min_h=h),
        AspectRatioFilter(max=aspect_ratio)
    ]
    item,im=get_image(filters,args.subreddit,args.tab)
    LOG.debug("Image %s fits the criteria"%item['url'])

    filename=time.strftime(args.file,time.gmtime())
    dirname=os.path.dirname(filename)
    LOG.debug('Filname is %s',filename)
    if not dirname=='' or os.path.isdir(dirname):
        LOG.debug('Creating directory %s',dirname)
        os.makedirs(dirname)

# Calculate the average color
    pixels=np.asarray(im.getdata())
    color='#'+''.join([format(int(r.mean().round()),'x') for r in pixels.T])
    LOG.debug('Average color is %s',color)

    save_data(filename+'.jpg',lambda f: im.save(f,'JPEG'))
    css=string.Template(open(args.template).read()).substitute(locals())
    save_data(filename+'.css',lambda f: f.write(css))
    info=json.dumps(item, sort_keys=True,indent=4, separators=(',', ': '))
    save_data(filename+'.js',lambda f: f.write(info))
#    img_filename=filename+'.jpg'
#    link_name=args.link+'.jpg'
#    LOG.debug("Saving image to %s",img_filename)
#    img_file=open(img_filename,'wb')
#    im.save(img_file,'JPEG')
#    img_file.close()
#    os.unlink(link_name)
#    os.symlink(img_filename,link_name)

#    css_filename=filename+'.css'
#    link_name=args.link+'.css'
#    LOG.debug("Saving css to %s",css_filename)
#    css_file=open(css_filename,'wb')
#    css_file.write(string.Template(open(args.template).read()).substitute(locals()))
#    css_file.close()
#    os.unlink(link_name)
#    os.symlink(css_filename,link_name)
#    os.symlink(css_filename,args.link+'.css')

#    info_filename=filename+'.js'
#    link_name=args.link+'.js'
#    LOG.debug("Saving info to %s",info_filename)
#    info_file=open(info_filename,'wb')
#    info_file.write('var image_info='+json.dumps(item, sort_keys=True,indent=4, separators=(',', ': ')))
#    info_file.close()
#    os.unlink(link_name)
#    os.symlink(info_filename,link_name)


