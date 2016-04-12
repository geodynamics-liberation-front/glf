<pre>
This is included content.
<?= __FILE__?>

<?= $_SERVER['DOCUMENT_ROOT']?>

<?= substr(__FILE__,strlen($_SERVER['DOCUMENT_ROOT'])) ?>

<?php var_dump($_SERVER); ?>
</pre>
<p>
<a href="info">PHP Info</a>
<p>
