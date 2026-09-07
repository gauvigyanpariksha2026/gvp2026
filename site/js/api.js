/**
 * Fetch-based client for the GVP 2026 Apps Script JSON API.
 *
 * Deploy apps-script/Code.gs as an Apps Script Web App
 * (Execute as: Me · Who has access: Anyone), then paste the
 * resulting URL (ends in /exec) below.
 */
var GVP_API = (function () {
  var API_URL = 'https://script.google.com/macros/s/AKfycbwQQUtYNfxPgrTaJB2bY517jDpNo0knfYdnSFlQNZ7LRSXO1-Xg3lQe6KWnbalxxAIK/exec';
  var REQUEST_TIMEOUT_MS = 30000;

  function configured() {
    return !!API_URL && API_URL.indexOf('PASTE_') !== 0;
  }

  function get(action, params) {
    if (!configured()) return Promise.reject(new Error('API_URL is not set in js/api.js'));
    var url = API_URL + '?action=' + encodeURIComponent(action);
    params = params || {};
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v !== undefined && v !== null && v !== '') {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
      }
    });
    return request_(url, { method: 'GET', cache: 'no-store' });
  }

  function post(action, payload) {
    if (!configured()) return Promise.reject(new Error('API_URL is not set in js/api.js'));
    // Content-Type must stay text/plain so this remains a CORS "simple request" —
    // Apps Script Web Apps do not answer CORS preflight (OPTIONS) requests.
    return request_(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload || {} })
    });
  }

  function request_(url, options, retriesLeft) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('ब्राउज़र नेटवर्क अनुरोध का समर्थन नहीं करता / This browser does not support network requests'));
    }

    var isGet = !options || !options.method || options.method === 'GET';
    if (retriesLeft === undefined) {
      retriesLeft = isGet ? 1 : 0;
    }

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      options.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    }

    function cleanup_(value) {
      if (timer) clearTimeout(timer);
      return value;
    }

    return fetch(url, options)
      .then(function (res) {
        if (!res.ok) throw new Error('सर्वर त्रुटि / Server HTTP error: ' + res.status);
        return readJson_(res);
      })
      .then(cleanup_, function (err) {
        cleanup_();
        if (isGet && retriesLeft > 0) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 800);
          }).then(function () {
            return request_(url, options, retriesLeft - 1);
          });
        }
        if (err && err.name === 'AbortError') {
          throw new Error('नेटवर्क समय समाप्त (Request timed out). कृपया अपना इंटरनेट कनेक्शन जांचें और पुनः प्रयास करें।');
        }
        throw err;
      });
  }

  function readJson_(res) {
    return res.text().then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('सर्वर से अमान्य उत्तर (Unexpected response from server). कृपया पुनः प्रयास करें।');
      }
    });
  }

  return { configured: configured, get: get, post: post };
})();
