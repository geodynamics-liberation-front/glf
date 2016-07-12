"use strict";
function init()
{
	// Set the size and color of the inline images
	var inline_objects=document.querySelectorAll('object.inline')
	for( var i=0; i<inline_objects.length; i++ )
	{
		var io=inline_objects[i]
		var s=window.getComputedStyle(io.parentNode)
		io.style.height=s.fontSize
		inline_objects[i].addEventListener('load', genSetColorFunction(inline_objects[i],s.color))
	}

	// Set the click handler for the thumbnail images
	var selectOne = new SelectOne('click','selected')
	var thumbnail_images=document.querySelectorAll('img.thumbnail')
	for( var i=0; i<thumbnail_images.length; i++ )
	{
		selectOne.add(thumbnail_images[i].parentNode,thumbnail_images[i])
	}
}

function genSetColorFunction(io,color)
{
	return function(e) { 
		// Set the color of the SVG to match the font
		if( "setColor" in io.getSVGDocument().defaultView )
		{
			io.getSVGDocument().defaultView.setColor(color)
		}
	}
}

function SelectOne(event_name,classname)
{
	this.event_name=event_name;
	this.classname=classname;
	this.nodes=[]
}

SelectOne.prototype.add = function(node,event_node)
{
	var self=this
	event_node=event_node || node
	event_node.addEventListener(this.event_name,function () { self.select(node); })	
	this.nodes.push(node)
}

SelectOne.prototype.select = function(node) 
{
	var turnon = !has_class(node,'selected')
	for( var i=0; i<this.nodes.length; i++ )
	{
		remove_class(this.nodes[i],this.classname)
	}
	if( turnon )
	{
		add_class(node,this.classname)
	}
	node.scrollIntoView({behavior: "smooth"})
}
