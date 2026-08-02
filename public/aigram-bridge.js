/* aigram-bridge.js — vanilla-JS twin of shared/runtime/bridge.ts
 *
 * For non-bundled HTML games. Drop this file beside index.html, include
 * before any code that talks to the platform:
 *
 *     <meta name="game-uuid" content="<uuid4>" />
 *     <script src="./aigram-bridge.js"></script>
 *
 * Exposes:
 *
 *     window.Aigram = {
 *       apiOrigin, telegramId, gameUuid, isInAigram, canRank,
 *       callAigramAPI(url, method?, data?) -> Promise,
 *       postAigramAPI(url, data) -> void,
 *       openAigramProfile(userId), openAigramPost(postId),
 *     }
 *
 * IMPORTANT: do not rewrite or simplify the bodies of callAigramAPI /
 * postAigramAPI. The envelope (base64-of-JSON, request_id, emitter) and
 * the iOS WKWebView fallback (window.webkit.messageHandlers.aigram + a
 * per-request global callback) are load-bearing platform contract.
 * Keep in sync with shared/runtime/bridge.ts.
 */
(function () {
  'use strict';

  var params    = new URLSearchParams(window.location.search);
  var rawOrigin = params.get('api_origin');
  var apiOrigin = rawOrigin ? decodeURIComponent(rawOrigin) : null;
  var telegramId = params.get('telegram_id') || null;

  var metaUuid = document.querySelector('meta[name="game-uuid"]');
  var gameUuid =
    (window.__GAME_UUID__) ||
    (metaUuid && metaUuid.getAttribute('content')) ||
    params.get('session_id') ||
    null;

  var isInAigram = !!(apiOrigin && telegramId);
  var canRank    = isInAigram && !!gameUuid;

  function toB64(s)   { return btoa(unescape(encodeURIComponent(s))); }
  function fromB64(s) { return decodeURIComponent(escape(atob(s))); }

  function sendEnvelope(payload) {
    var w = window;
    if (
      w.webkit &&
      w.webkit.messageHandlers &&
      w.webkit.messageHandlers.aigram
    ) {
      w.webkit.messageHandlers.aigram.postMessage('callAPI-' + payload);
    } else {
      window.parent.postMessage('callAPI-' + payload, apiOrigin || '*');
    }
  }

  function callAigramAPI(url, method, data) {
    method = method || 'GET';
    if (data === undefined) data = null;

    return new Promise(function (resolve, reject) {
      var requestId = (crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      var timer;

      var payload = toB64(JSON.stringify({
        url: url,
        method: method,
        data: data,
        request_id: requestId,
        emitter: window.location.origin,
      }));

      function finish(result) {
        clearTimeout(timer);
        cleanup();
        if (result.success) resolve(result.data);
        else reject(new Error(result.error || 'API error'));
      }

      // iOS WKWebView: native invokes this global with the JSON result.
      var cbKey = '__aigram_cb_' + requestId.replace(/-/g, '_');
      window[cbKey] = function (resultJson) {
        try {
          var r = JSON.parse(resultJson);
          if (r.request_id !== requestId) return;
          finish(r);
        } catch (e) { /* ignore */ }
      };

      // Web iframe / Android WebView: postMessage round-trip.
      function handler(event) {
        if (apiOrigin && event.origin !== apiOrigin) return;
        var msg = typeof event.data === 'string' ? event.data : '';
        if (msg.indexOf('callAPIResult-') !== 0) return;
        try {
          var r = JSON.parse(fromB64(msg.slice('callAPIResult-'.length)));
          if (r.request_id !== requestId) return;
          finish(r);
        } catch (e) { /* ignore */ }
      }
      window.addEventListener('message', handler);

      function cleanup() {
        window.removeEventListener('message', handler);
        try { delete window[cbKey]; } catch (e) { window[cbKey] = undefined; }
      }

      timer = setTimeout(function () {
        cleanup();
        reject(new Error('timeout'));
      }, 10000);

      sendEnvelope(payload);
    });
  }

  function postAigramAPI(url, data) {
    var requestId = (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    var payload = toB64(JSON.stringify({
      url: url,
      method: 'post',
      data: data,
      request_id: requestId,
      emitter: window.location.origin,
    }));
    sendEnvelope(payload);
  }

  function openAigramProfile(userId) {
    if (!apiOrigin || !userId) return;
    try {
      var encoded = btoa(JSON.stringify({ id: String(userId) }));
      window.parent.postMessage(
        'AW.PROFILE.OPEN-' + encoded,
        new URL(apiOrigin).origin
      );
    } catch (e) { /* ignore */ }
  }

  function openAigramPost(postId) {
    if (!apiOrigin || !postId) return;
    try {
      var encoded = btoa(JSON.stringify({ post_id: String(postId) }));
      window.parent.postMessage(
        'AW.POST.OPEN-' + encoded,
        new URL(apiOrigin).origin
      );
    } catch (e) { /* ignore */ }
  }

  window.Aigram = {
    apiOrigin: apiOrigin,
    telegramId: telegramId,
    gameUuid: gameUuid,
    isInAigram: isInAigram,
    canRank: canRank,
    callAigramAPI: callAigramAPI,
    postAigramAPI: postAigramAPI,
    openAigramProfile: openAigramProfile,
    openAigramPost: openAigramPost,
  };
})();
