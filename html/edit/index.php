<?php
$edit_file=$_SERVER['DOCUMENT_ROOT'].$_SERVER['PATH_INFO'];
if (!file_exists($edit_file))
{
	header("HTTP/1.0 404 Not Found");
	exit;
}
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Title of the document</title>
<link rel="stylesheet" href="/script/jquery-ui/jquery-ui.css">
<link rel="stylesheet" href="/script/codemirror/lib/codemirror.css">
<script src="/script/codemirror/lib/codemirror.js"></script>
<script src="/script/codemirror/addon/edit/matchbrackets.js"></script>
<script src="/script/codemirror/mode/htmlmixed/htmlmixed.js"></script>
<script src="/script/codemirror/mode/xml/xml.js"></script>
<script src="/script/codemirror/mode/javascript/javascript.js"></script>
<script src="/script/codemirror/mode/css/css.js"></script>
<script src="/script/codemirror/mode/clike/clike.js"></script>
<script src="/script/codemirror/mode/php/php.js"></script>
<script>
function init()
{
	var myCodeMirror = CodeMirror.fromTextArea($('#editor')[0],{
        lineNumbers: true,
        matchBrackets: true,
        mode: "application/x-httpd-php",
        indentUnit: 4,
        indentWithTabs: true
	});
//$('.CodeMirror').resizable({
//  resize: function() {
//    myCodeMirror.setSize($(this).width(), $(this).height());
//    myCodeMirror.refresh();
//  }});
}
</script>
</head>

<body>
<textarea id="editor">
<?php
readfile($edit_file);
?>
</textarea>
<script src="/script/jquery.js"></script>
<script src="/script/jquery-ui/jquery-ui.min.js"></script>
<script>
$( init )
</script>
</body>
</html>
