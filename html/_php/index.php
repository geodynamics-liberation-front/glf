<?php
include_once($_SERVER['DOCUMENT_ROOT'].'/_lib/glf.php');
?><!DOCTYPE html>

<html>
<head>
<meta charset="UTF-8">
<title>Title of the document</title>
<style>
* {
padding: 0;
margin: 0;
}

a.glf_edit {
position: fixed;
color: white;
margin: 5px;
text-decoration: none;
opacity: 0.0;
border: 2px solid rgba(0,0,0,.5);
outline: none;
background: rgba(0,0,0,.5);
transition: opacity .5s;
border-radius: 50%;
width: 3em;
height: 3em;
line-height: 3em;
text-align: center;
}

div.glf_edit {
transition: background .5s;
}

div.glf_edit:hover {
background: rgba(0,0,0,.3);
}

div.glf_edit:hover a.glf_edit {
position: absolute;
opacity: 1.0;
}
</style>
<script>
function init()
{
	$("a.glf_edit" ).draggable();	
}
</script>
</head>

<body>
<?php include_content('content2.php')?>
<?php include_content('content.php')?>
<script src="/script/jquery.js"></script>
<script src="/script/jquery-ui.js"></script>
<script>
$( init )
</script>
</body>

</html>
