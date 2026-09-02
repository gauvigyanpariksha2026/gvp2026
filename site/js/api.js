/**
 * Fetch-based client for the GVP 2026 Apps Script JSON API.
 *
 * Deploy apps-script/Code.gs as an Apps Script Web App
 * (Execute as: Me · Who has access: Anyone), then paste the
 * resulting URL (ends in /exec) below.
 */
var GVP_API = (function () {
  var API_URL = 'https://script.google.com/macros/s/AKfycbwQQUtYNfxPgrTaJB2bY517jDpNo0knfYdnSFlQNZ7LRSXO1-Xg3lQe6KWnbalxxAIK/exec';

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
    return fetch(url, { method: 'GET' }).then(readJson_);
  }

  function post(action, payload) {
    if (!configured()) return Promise.reject(new Error('API_URL is not set in js/api.js'));
    // Content-Type must stay text/plain so this remains a CORS "simple request" —
    // Apps Script Web Apps do not answer CORS preflight (OPTIONS) requests.
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload || {} })
    }).then(readJson_);
  }

  function readJson_(res) {
    return res.text().then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('Unexpected response from server');
      }
    });
  }

  return { configured: configured, get: get, post: post };
})();
