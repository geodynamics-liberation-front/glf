var script_src=document.currentScript.src;

function toggle_class(node,classname1,classname2)
{
	var re;
	/* if classname1 exists */
	if( node.className.search( re=new RegExp('\\b'+classname1+'\\b','g')) >-1 )
	{
		node.className=node.className.replace( re,'')
		node.className=node.className+' '+classname2;
		node.className=node.className.replace( /\s{2,}/g,' ')
	}
	/* if classname 2 exists */
	else if( node.className.search( re=new RegExp('\\b'+classname2+'\\b','g')) >-1 )
	{
		node.className=node.className.replace( re,'')
		node.className=node.className+' '+classname1;
		node.className=node.className.replace( /\s{2,}/g,' ')
	}
}

function add_class(node,classname)
{
	var cn=node.className;
	if( cn.search( new RegExp('\\b'+classname+'\\b')) == -1 )
	{
		node.className=cn+' '+classname;
	}
}

function remove_class(node,classname)
{
	node.className=node.className.replace( new RegExp('\\b'+classname+'\\b','g'),'')
	node.className=node.className.replace( /\s{2,}/g,' ')
}

function has_class(node,classname)
{
	return node.className.search( new RegExp('\\b'+classname+'\\b')) > -1 
}


/*
 * Does a binary search in 'a' to find the closet value to 'v'
 * Returns the index of 'a' with the closest value
 * 'a' must be sorted ascendingly
 *
 * A note about turning a float into an integer:
 * The bitwise operators of Javascript turn the operands into 32 but integers
 * This turns out to be faster than Math.floor, see: 
 * http://blog.blakesimpson.co.uk/read/58-fastest-alternative-to-math-floor-in-javascript
 */
function bsearch(v,a)
{
	var n
	var l=0
	var h=a.length-1
	while( true )
	{
		n=( (h+l)/2 )<<0 
		if( a[n]==v ) break // prefect equality
		else if( a[n]<v ) // guess is too low
		{
			if( h-n==1 ) // the value is between n and h
			{
				if((a[h]-v)<(v-a[n])) n=h
				break
			}
			l=n
		}
		else if( a[n]>v ) // guess is too high
		{
			if( n-l==1 ) // the value is between l and n
			{
				if((v-a[l])<(a[n]-v)) n=l
				break
			}
			h=n
		}
	}
	return n
}

function LinearInterpolate1d(a)
{
	this.update(a)
}

LinearInterpolate1d.prototype.update = function(a)
{
	this.a=a
	this.indicies=Object.keys(a)
}

LinearInterpolate1d.prototype.value = function(n)
{
	var l,h
	var nearest_ndx=bsearch(n,this.indicies)
	var ndx=this.indicies[nearest_ndx]
	if( n==ndx || (n<ndx && nearest_ndx==0) || (n>ndx && nearest_ndx==this.indicies.length-1)) { return this.a[ndx] }
	if( n<ndx ) { l=this.indicies[nearest_ndx-1]; h=ndx }
	else { l=ndx;h=this.indicies[nearest_ndx+1] }
	return (a[h]-a[l])*(n-l)/(h-l)+a[l]
}
