<?php
function include_content($fname)
{
	$rel_fname=substr(realpath($fname),strlen($_SERVER['DOCUMENT_ROOT'])); 
	echo('<div class="glf_edit">');
	echo('<a class="glf_edit" href="/edit'.$rel_fname.'">edit</a>');
	include($fname);
	echo('</div>');
}
?>
