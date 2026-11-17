// Keep the footer year current.
var yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Messages come from site/content/site.json ("forms"), written into the page when it's built.
var TEXT = { errors: {} };
try { TEXT = JSON.parse(document.getElementById('cruk-text').textContent); } catch (e) {}

// Shared helper: POST JSON to the backend API.
function apiPost(path, data) {
  var base = (window.CRUK_CONFIG && window.CRUK_CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) return Promise.reject(new Error('not-configured'));
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        var err = new Error(body.error || 'request-failed');
        err.status = res.status;
        throw err;
      }
      return body;
    });
  });
}

// Contact and newsletter forms.
document.querySelectorAll('.js-api-form').forEach(function (form) {
  var startedAt = Date.now();
  var errorEl = form.querySelector('.form-error');
  var button = form.querySelector('button[type="submit"]');
  var buttonText = button.textContent;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.hidden = true;

    // Use the browser's built-in validation messages.
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var data = {};
    new FormData(form).forEach(function (value, key) { data[key] = String(value).trim(); });
    data.elapsedMs = Date.now() - startedAt; // bots submit instantly

    button.disabled = true;
    button.textContent = TEXT.sending || 'Sending…';

    apiPost(form.dataset.endpoint, data).then(function () {
      var msg = document.createElement('p');
      msg.className = 'form-success';
      msg.setAttribute('role', 'status');
      msg.setAttribute('tabindex', '-1');
      msg.textContent = form.dataset.success;
      form.replaceWith(msg);
      msg.focus();
    }).catch(function (err) {
      button.disabled = false;
      button.textContent = buttonText;
      errorEl.textContent = TEXT.errors[err.message] || TEXT.genericError || 'Sorry, something went wrong. Please try again.';
      errorEl.hidden = false;
    });
  });
});

// Newsletter confirm and unsubscribe pages: post the ?e=...&t=... from the email link when the button is pressed.
(function () {
  var box = document.querySelector('[data-link-action]');
  if (!box) return;
  var params = new URLSearchParams(location.search);
  var e = params.get('e'), t = params.get('t');
  var done = document.getElementById('done');
  var bad = document.getElementById('bad');
  var errorEl = box.querySelector('.form-error');
  var button = box.querySelector('button');
  if (!e || !t) { box.hidden = true; bad.hidden = false; return; }
  button.addEventListener('click', function () {
    errorEl.hidden = true;
    button.disabled = true;
    apiPost(button.dataset.endpoint, { e: e, t: t }).then(function () {
      box.hidden = true; done.hidden = false; done.focus();
    }).catch(function (err) {
      button.disabled = false;
      if (err.status === 400 || err.status === 404) { box.hidden = true; bad.hidden = false; return; }
      errorEl.textContent = TEXT.linkError || 'Sorry, something went wrong. Please try again in a moment.';
      errorEl.hidden = false;
    });
  });
})();

// World map: zoom with the buttons, a double-click or a pinch (Ctrl/⌘ + scroll on a computer),
// drag to move around, and tap or hover a dot to see the place.
document.querySelectorAll('[data-map]').forEach(function (wrap) {
  var svg = wrap.querySelector('svg');
  var tip = wrap.querySelector('.map-tip');
  var pins = [].slice.call(svg.querySelectorAll('.pins circle'));
  var vb = svg.viewBox.baseVal;
  var W = vb.width, H = vb.height;
  var view = { x: 0, y: 0, w: W, h: H };
  var MAX_ZOOM = 10;

  function apply() {
    var scale = W / view.w;
    view.w = Math.min(W, Math.max(W / MAX_ZOOM, view.w));
    view.h = view.w * H / W;
    view.x = Math.min(W - view.w, Math.max(0, view.x));
    view.y = Math.min(H - view.h, Math.max(0, view.y));
    svg.setAttribute('viewBox', [view.x, view.y, view.w, view.h].join(' '));
    // Keep the dots the same size on screen at every zoom level.
    var px = svg.clientWidth < 600 ? 5 : 6.5; // dot radius in screen pixels
    var r = px * view.w / (svg.clientWidth || W);
    pins.forEach(function (c) { c.setAttribute('r', r.toFixed(2)); });
    wrap.classList.toggle('zoomed', view.w < W - 0.5);
    hideTip();
  }

  // Point on the map (in map units) under a screen position.
  function toMap(clientX, clientY) {
    var rect = svg.getBoundingClientRect();
    return { x: view.x + (clientX - rect.left) / rect.width * view.w, y: view.y + (clientY - rect.top) / rect.height * view.h };
  }

  function zoomAt(factor, clientX, clientY) {
    var rect = svg.getBoundingClientRect();
    if (clientX === undefined) { clientX = rect.left + rect.width / 2; clientY = rect.top + rect.height / 2; }
    var p = toMap(clientX, clientY);
    var w = Math.min(W, Math.max(W / MAX_ZOOM, view.w / factor));
    var h = w * H / W;
    view.x = p.x - (clientX - rect.left) / rect.width * w;
    view.y = p.y - (clientY - rect.top) / rect.height * h;
    view.w = w; view.h = h;
    apply();
  }

  wrap.querySelectorAll('[data-zoom]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var z = btn.getAttribute('data-zoom');
      if (z === 'in') zoomAt(2);
      else if (z === 'out') zoomAt(0.5);
      else { view = { x: 0, y: 0, w: W, h: H }; apply(); }
    });
  });

  svg.addEventListener('dblclick', function (e) { e.preventDefault(); zoomAt(2, e.clientX, e.clientY); });
  svg.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) return; // plain scrolling scrolls the page
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY);
  }, { passive: false });

  // Dragging and pinching.
  var pointers = {}, last = null, moved = false;
  function mid() {
    var ps = Object.keys(pointers).map(function (k) { return pointers[k]; });
    var x = 0, y = 0;
    ps.forEach(function (p) { x += p.x; y += p.y; });
    var d = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    return { x: x / ps.length, y: y / ps.length, d: d, n: ps.length };
  }
  svg.addEventListener('pointerdown', function (e) {
    // On touch screens, one finger scrolls the page until the map is zoomed in.
    if (e.pointerType === 'touch' && !wrap.classList.contains('zoomed') && Object.keys(pointers).length === 0) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      last = mid(); moved = false;
      return;
    }
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    last = mid(); moved = false;
  });
  window.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var now = mid();
    if (now.n !== last.n) { last = now; return; }
    var rect = svg.getBoundingClientRect();
    if (now.n === 2 && last.d > 0) {
      zoomAt(now.d / last.d, now.x, now.y);
    } else if (now.n === 1 && !wrap.classList.contains('zoomed')) {
      last = now; return; // nothing to drag at full-world view
    }
    var dx = now.x - last.x, dy = now.y - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    view.x -= dx / rect.width * view.w;
    view.y -= dy / rect.height * view.h;
    if (moved) wrap.classList.add('dragging');
    apply();
    last = now;
  });
  function release(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    last = mid();
    if (!Object.keys(pointers).length) wrap.classList.remove('dragging');
  }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // Place names.
  function showTip(c) {
    var wr = wrap.getBoundingClientRect(), cr = c.getBoundingClientRect();
    tip.textContent = c.getAttribute('data-label');
    tip.style.left = (cr.left + cr.width / 2 - wr.left) + 'px';
    tip.style.top = (cr.top - wr.top) + 'px';
    tip.hidden = false;
    pins.forEach(function (p) { p.classList.toggle('active', p === c); });
  }
  function hideTip() { tip.hidden = true; pins.forEach(function (p) { p.classList.remove('active'); }); }
  pins.forEach(function (c) {
    c.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') showTip(c); });
    c.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hideTip(); });
    c.addEventListener('click', function (e) { e.stopPropagation(); if (!moved) showTip(c); });
  });
  svg.addEventListener('click', function () { if (!moved) hideTip(); });

  apply();
  window.addEventListener('resize', apply);
});
