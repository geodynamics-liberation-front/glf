// Tag filtering for the project catalog. Selected tags combine with AND and are
// mirrored into the URL hash (#maps+interactive) so a filtered view can be linked.
(function () {
  var entries = Array.prototype.slice.call(document.querySelectorAll('#entries .entry'));
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.tag-filter'));
  var empty = document.getElementById('entries-empty');
  if (!entries.length || !buttons.length) return;

  var selected = new Set();

  function apply() {
    var shown = 0;
    entries.forEach(function (li) {
      var tags = (li.getAttribute('data-tags') || '').split(/\s+/);
      var ok = true;
      selected.forEach(function (t) { if (tags.indexOf(t) < 0) ok = false; });
      li.hidden = !ok;
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

  // Tag links inside entries jump to the catalog with that tag selected.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.tag[data-tag]');
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
