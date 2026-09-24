// The front page: picture of the day, the scroll that brings the text up on
// arrival, the menu that appears once the text scrolls into view, and the
// picture credit with previous/next.
(function () {
  'use strict';
  var menu = document.getElementById('menu');
  var textBody = document.getElementById('text-body');
  var image = document.getElementById('background_image');
  var style = document.getElementById('background_style');
  var pod = document.getElementById('pod');
  var infoIcon = document.getElementById('info-icon');
  var authorInfo = document.getElementById('author-info');

  // ---- scrolling: show the menu once the text is on screen
  function checkTop() {
    menu.classList.toggle('is-visible', textBody.getBoundingClientRect().top < window.innerHeight);
  }
  window.addEventListener('scroll', checkTop, { passive: true });
  window.addEventListener('resize', checkTop);

  // ---- on arrival, let the picture show for a moment, then bring the text up
  // until the top of its fade meets the bottom of the menu. Skipped once the
  // visitor scrolls or touches anything, or when the browser has restored a
  // scroll position.
  var fadeIn = document.querySelector('.fade-in');
  var arrived = false;
  function arrive() {
    if (arrived) return;
    arrived = true;
    if (window.scrollY > 0) return;
    var top = fadeIn.getBoundingClientRect().top - menu.getBoundingClientRect().bottom;
    if (top <= 0) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
  }
  function arriveAfter(ms) {
    setTimeout(arrive, ms);
  }
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (type) {
    window.addEventListener(
      type,
      function () {
        arrived = true;
      },
      { once: true, passive: true },
    );
  });
  image.addEventListener(
    'load',
    function () {
      arriveAfter(1000);
    },
    { once: true },
  );
  image.addEventListener(
    'error',
    function () {
      arriveAfter(0);
    },
    { once: true },
  );
  arriveAfter(3000); // a slow picture doesn't hold the text back for long

  // ---- picture of the day
  var days = [];
  var current = 0;

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function show(i) {
    if (i < 0 || i >= days.length) return;
    current = i;
    var d = days[i];
    image.src = '/backgrounds/' + d.date + '.jpg';
    image.alt = d.title || '';
    style.href = '/backgrounds/' + d.date + '.css';
    var html = '';
    if (d.permalink) html += '<a href="' + escapeHTML(d.permalink) + '">' + escapeHTML(d.title) + '</a>';
    else html += escapeHTML(d.title);
    if (d.author)
      html += '<br>By <a href="https://www.reddit.com/u/' + escapeHTML(d.author) + '">' + escapeHTML(d.author) + '</a>';
    html += ' <span class="date">' + escapeHTML(d.date.replace(/\./g, '-')) + '</span>';
    if (days.length > 1) {
      html +=
        '<a class="button" id="previous_style_btn" role="button" tabindex="0" title="Previous day"' +
        (i + 1 >= days.length ? ' hidden' : '') +
        '>&lt;&lt;</a>';
      html +=
        '<a class="button" id="next_style_btn" role="button" tabindex="0" title="Next day"' +
        (i <= 0 ? ' hidden' : '') +
        '>&gt;&gt;</a>';
    }
    authorInfo.innerHTML = html;
    var prev = document.getElementById('previous_style_btn');
    var next = document.getElementById('next_style_btn');
    if (prev) prev.addEventListener('click', older);
    if (next) next.addEventListener('click', newer);
    pod.classList.remove('is-hidden');
  }
  function older() {
    show(current + 1);
  }
  function newer() {
    show(current - 1);
  }

  fetch('/backgrounds/index.json')
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (idx) {
      days = idx.days || [];
      if (days.length) show(0);
      else arrive();
    })
    .catch(function () {
      arrive(); // no pictures published: the page stays dark
    });

  // ---- the credit box: hover shows it on desktop, a tap toggles it on touch
  infoIcon.addEventListener('click', function () {
    pod.classList.toggle('is-open');
  });
  document.addEventListener('click', function (e) {
    if (!pod.contains(e.target)) pod.classList.remove('is-open');
  });

  // ---- swipe between days on touch screens (left for newer, right for older)
  var swipeStart = null;
  document.addEventListener(
    'touchstart',
    function (e) {
      var t = e.changedTouches[0];
      swipeStart = [t.clientX, t.clientY, Date.now()];
    },
    { passive: true },
  );
  document.addEventListener(
    'touchend',
    function (e) {
      if (!swipeStart) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - swipeStart[0],
        dy = Math.abs(t.clientY - swipeStart[1]),
        dt = Date.now() - swipeStart[2];
      swipeStart = null;
      if (Math.abs(dx) > dy + 70 && dy < 200 && dt < 1000) {
        var rtl = getComputedStyle(document.body).direction === 'rtl';
        if (dx < 0 !== rtl) newer();
        else older();
      }
    },
    { passive: true },
  );

  checkTop();
})();
