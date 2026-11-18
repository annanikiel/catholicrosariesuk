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
// Dots that would overlap on screen are grouped into one bigger dot showing how many places it holds;
// zooming in splits them up. Each dot or group gets a curved line from where the rosaries are made.
document.querySelectorAll('[data-map]').forEach(function (wrap) {
  var svg = wrap.querySelector('svg');
  var tip = wrap.querySelector('.map-tip');
  var data = JSON.parse(wrap.querySelector('.map-data').textContent);
  var places = data.places, origin = data.origin;
  var NS = 'http://www.w3.org/2000/svg';
  var gPins = svg.querySelector('.pins'), gRoutes = svg.querySelector('.routes'), gOrigin = svg.querySelector('.origin');
  var vb = svg.viewBox.baseVal;
  var W = vb.width, H = vb.height;
  var view = { x: 0, y: 0, w: W, h: H };
  var MAX_ZOOM = 12, drawnFor = null, groups = [], detail = 'none';

  function px() { return (svg.clientWidth || W) / view.w; } // screen pixels per map unit
  function el(name, attrs) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // Group places that would be closer than about 2 dots apart on screen.
  function cluster() {
    var gap = (svg.clientWidth < 600 ? 16 : 20) / px();
    var used = [], out = [];
    for (var i = 0; i < places.length; i++) {
      if (used[i]) continue;
      var members = [i]; used[i] = true;
      var sx = places[i][0], sy = places[i][1];
      for (var j = i + 1; j < places.length; j++) {
        if (used[j]) continue;
        var cx = sx / members.length, cy = sy / members.length;
        if (Math.hypot(places[j][0] - cx, places[j][1] - cy) < gap) { members.push(j); used[j] = true; sx += places[j][0]; sy += places[j][1]; }
      }
      out.push({ x: sx / members.length, y: sy / members.length, members: members });
    }
    return out;
  }

  function draw() {
    var k = px();
    groups = cluster();
    gPins.textContent = ''; gRoutes.textContent = '';
    var base = svg.clientWidth < 600 ? 4.5 : 6;
    groups.forEach(function (g, i) {
      var n = g.members.length;
      var r = Math.min(base * 2.6, base * (1 + 0.45 * Math.log2(n))) / k;
      if (origin) {
        var dx = g.x - origin.x, dy = g.y - origin.y, len = Math.hypot(dx, dy);
        if (len * k > 14) {
          // Curve bending upwards, more for longer journeys.
          var nx = -dy / len, ny = dx / len;
          if (ny > 0) { nx = -nx; ny = -ny; }
          var bend = len * 0.22;
          var qx = origin.x + dx / 2 + nx * bend, qy = origin.y + dy / 2 + ny * bend;
          gRoutes.appendChild(el('path', { d: 'M' + origin.x + ' ' + origin.y + 'Q' + qx + ' ' + qy + ' ' + g.x + ' ' + g.y }));
        }
      }
      var c = el('circle', { cx: g.x, cy: g.y, r: r, 'data-i': i, 'class': n > 1 ? 'group' : '' });
      gPins.appendChild(c);
      if (n > 1) {
        var t = el('text', { x: g.x, y: g.y, 'data-i': i, 'font-size': (n > 99 ? 9 : 11) / k });
        t.textContent = n;
        gPins.appendChild(t);
      }
    });
    if (gOrigin) gOrigin.querySelector('circle').setAttribute('r', (svg.clientWidth < 600 ? 5 : 6.5) / k);
    drawnFor = view.w + ':' + svg.clientWidth;
  }

  function apply() {
    view.w = Math.min(W, Math.max(W / MAX_ZOOM, view.w));
    view.h = view.w * H / W;
    view.x = Math.min(W - view.w, Math.max(0, view.x));
    view.y = Math.min(H - view.h, Math.max(0, view.y));
    svg.setAttribute('viewBox', [view.x, view.y, view.w, view.h].join(' '));
    if (drawnFor !== view.w + ':' + svg.clientWidth) draw(); // regroup only when the zoom changes
    if (detail === 'none' && view.w < W / 2.5) loadDetail();
    wrap.classList.toggle('zoomed', view.w < W - 0.5);
    hideTip();
  }

  // Swap in the detailed coastline the first time someone zooms in.
  function loadDetail() {
    detail = 'loading';
    fetch('map-detail.json').then(function (r) { return r.json(); }).then(function (shapes) {
      var land = svg.querySelector('.land');
      var frag = document.createDocumentFragment();
      shapes.forEach(function (s) { frag.appendChild(el('path', s[1] ? { d: s[0], 'class': 'visited' } : { d: s[0] })); });
      land.textContent = '';
      land.appendChild(frag);
      detail = 'loaded';
    }).catch(function () { detail = 'none'; });
  }

  // Zoom so that a map point ends up in the middle.
  function zoomTo(mx, my, factor) {
    var w = Math.min(W, Math.max(W / MAX_ZOOM, view.w / factor)), h = w * H / W;
    view.x = mx - w / 2; view.y = my - h / 2; view.w = w; view.h = h;
    apply();
  }

  function zoomAt(factor, clientX, clientY) {
    var rect = svg.getBoundingClientRect();
    if (clientX === undefined) { clientX = rect.left + rect.width / 2; clientY = rect.top + rect.height / 2; }
    var mx = view.x + (clientX - rect.left) / rect.width * view.w;
    var my = view.y + (clientY - rect.top) / rect.height * view.h;
    var w = Math.min(W, Math.max(W / MAX_ZOOM, view.w / factor)), h = w * H / W;
    view.x = mx - (clientX - rect.left) / rect.width * w;
    view.y = my - (clientY - rect.top) / rect.height * h;
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

  // Dragging and pinching. On touch screens one finger scrolls the page until the map is zoomed in.
  var pointers = {}, last = null, moved = false;
  function mid() {
    var ps = Object.keys(pointers).map(function (k) { return pointers[k]; });
    var x = 0, y = 0;
    ps.forEach(function (p) { x += p.x; y += p.y; });
    return { x: x / ps.length, y: y / ps.length, d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0, n: ps.length };
  }
  svg.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    last = mid(); moved = false;
  });
  window.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var now = mid();
    if (now.n !== last.n) { last = now; return; }
    if (now.n === 2 && last.d > 0) zoomAt(now.d / last.d, now.x, now.y);
    else if (now.n === 1 && !wrap.classList.contains('zoomed')) { last = now; return; }
    var rect = svg.getBoundingClientRect(), dx = now.x - last.x, dy = now.y - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; wrap.classList.add('dragging'); }
    view.x -= dx / rect.width * view.w;
    view.y -= dy / rect.height * view.h;
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
  function label(g) {
    var names = g.members.map(function (i) { return places[i][2]; });
    if (names.length === 1) return names[0];
    var shown = names.slice(0, 2).map(function (n) { return n.split(',')[0]; }).join(', ');
    return data.more.replace('{names}', shown).replace('{count}', names.length - 2) + ' ' + data.zoomHint;
  }
  function showTip(text, target) {
    var wr = wrap.getBoundingClientRect(), cr = target.getBoundingClientRect();
    tip.textContent = text;
    tip.style.left = Math.min(wr.width - 12, Math.max(12, cr.left + cr.width / 2 - wr.left)) + 'px';
    tip.style.top = (cr.top - wr.top) + 'px';
    tip.classList.toggle('flip', cr.left + cr.width / 2 - wr.left > wr.width * 0.65);
    tip.classList.toggle('flip-left', cr.left + cr.width / 2 - wr.left < wr.width * 0.35);
    tip.hidden = false;
  }
  function hideTip() { tip.hidden = true; }
  function groupFor(target) { var i = target.getAttribute && target.getAttribute('data-i'); return i === null || i === undefined ? null : groups[+i]; }

  svg.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse') return;
    var g = groupFor(e.target);
    if (g) showTip(label(g), gPins.querySelector('circle[data-i="' + e.target.getAttribute('data-i') + '"]'));
    else if (gOrigin && gOrigin.contains(e.target)) showTip(origin.label, e.target);
  });
  svg.addEventListener('pointerout', function (e) { if (e.pointerType === 'mouse' && (groupFor(e.target) || (gOrigin && gOrigin.contains(e.target)))) hideTip(); });
  svg.addEventListener('click', function (e) {
    if (moved) return;
    var g = groupFor(e.target);
    if (g && g.members.length > 1) {
      // Zoom in on a group, centred on it, so it splits up.
      zoomTo(g.x, g.y, 3);
    } else if (g) {
      showTip(label(g), e.target);
    } else if (gOrigin && gOrigin.contains(e.target)) {
      showTip(origin.label, e.target);
    } else {
      hideTip();
    }
  });

  apply();
  window.addEventListener('resize', apply);
});
