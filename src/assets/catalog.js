// The projects page: click a thumbnail to open its write-up (one at a time,
// as on the original site), and filter by tag. Selected tags combine with AND
// and are mirrored into the URL hash (#maps+interactive) so a view can be linked.
(function () {
  'use strict';
  var entries = Array.prototype.slice.call(document.querySelectorAll('#entries > div.thumbnail'));
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.tag-filter'));
  var empty = document.getElementById('entries-empty');
  if (!entries.length) return;

  // ---- expand one project at a time
  function select(node) {
    var turnOn = !node.classList.contains('selected');
    entries.forEach(function (n) { n.classList.remove('selected'); });
    if (turnOn) {
      node.classList.add('selected');
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  entries.forEach(function (node) {
    var img = node.querySelector('img.thumbnail');
    if (!img) return;
    img.addEventListener('click', function () { select(node); });
    img.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(node); } });
  });

  // ---- tag filter
  var selected = new Set();
  function apply() {
    var shown = 0;
    entries.forEach(function (node) {
      var tags = (node.getAttribute('data-tags') || '').split(/\s+/);
      var ok = true;
      selected.forEach(function (t) { if (tags.indexOf(t) < 0) ok = false; });
      node.classList.toggle('is-hidden', !ok);
      if (ok) shown++;
    });
    buttons.forEach(function (b) {
      var t = b.getAttribute('data-tag');
      var on = t === '' ? selected.size === 0 : selected.has(t);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (empty) empty.hidden = shown > 0;
    var hash = selected.size ? '#' + Array.from(selected).join('+') : '';
    if (hash !== location.hash) history.replaceState(null, '', location.pathname + hash);
  }
  function readHash() {
    selected.clear();
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (h) h.split('+').forEach(function (t) { if (t) selected.add(t); });
    apply();
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-tag');
      if (t === '') selected.clear();
      else if (selected.has(t)) selected.delete(t);
      else selected.add(t);
      apply();
    });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-tag]');
    if (!a) return;
    e.preventDefault();
    selected.clear();
    selected.add(a.getAttribute('data-tag'));
    apply();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('hashchange', readHash);
  readHash();
})();
