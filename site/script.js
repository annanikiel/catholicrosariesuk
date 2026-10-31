// Keep the footer year current.
var yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Shared helper: POST JSON to the backend API.
window.CRUK_API = function (path, data) {
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
};

var ERROR_MESSAGES = {
  'invalid-email': 'Please enter a valid email address.',
  'invalid-name': 'Please enter your name.',
  'invalid-message': 'Please write a message (up to 5,000 characters).',
  'too-many-requests': 'Lots of messages are coming in just now. Please try again in a few minutes.'
};
var GENERIC_ERROR = 'Sorry, something went wrong and your form wasn’t sent. Please try again, or message me through Etsy.';

// Contact and newsletter forms.
document.querySelectorAll('.js-api-form').forEach(function (form) {
  var startedAt = Date.now();
  var errorEl = form.querySelector('.form-error');
  var button = form.querySelector('button[type="submit"]');
  var buttonText = button.textContent;

  function showError(text) {
    errorEl.textContent = text;
    errorEl.hidden = false;
  }

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
    button.textContent = 'Sending…';

    window.CRUK_API(form.dataset.endpoint, data).then(function () {
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
      showError(ERROR_MESSAGES[err.message] || GENERIC_ERROR);
    });
  });
});
