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
