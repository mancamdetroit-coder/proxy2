const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

function toAbsolute(url, base) {
  try {
    return new URL(url, base).href;
  } catch(e) { return null; }
}

function rewriteHtml(body, finalUrl) {
  const base = new URL(finalUrl).origin;

  // Inject base tag
  body = body.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="${finalUrl}">`
  );

  // Rewrite absolute URLs in all common attributes
  body = body.replace(
    /((?:href|src|action|data-src|data-href|poster|data-url|data-background|data-original|data-lazy-src|content)=["'])(https?:\/\/[^"']+)(["'])/gi,
    (match, before, url, after) => `${before}/proxy/${encodeURIComponent(url)}${after}`
  );

  // Rewrite root-relative URLs in all common attributes
  body = body.replace(
    /((?:href|src|action|data-src|data-href|poster|data-url|data-background|data-original|data-lazy-src|content)=["'])(\/(?!proxy\/)[^"']*)(["'])/gi,
    (match, before, path, after) => `${before}/proxy/${encodeURIComponent(base + path)}${after}`
  );

  // Rewrite srcset
  body = body.replace(
    /srcset=["']([^"']+)["']/gi,
    (match, srcset) => {
      const rewritten = srcset.replace(/(https?:\/\/[^\s,]+|\/[^\s,]+)/g, url => {
        if (url.startsWith('/proxy/')) return url;
        const abs = toAbsolute(url, finalUrl);
        return abs ? '/proxy/' + encodeURIComponent(abs) : url;
      });
      return `srcset="${rewritten}"`;
    }
  );

  // Rewrite inline style url()
  body = body.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, quote, rawUrl) => {
      const url = rawUrl.trim();
      if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/proxy/')) return match;
      const abs = toAbsolute(url, finalUrl);
      return abs ? `url('/proxy/${encodeURIComponent(abs)}')` : match;
    }
  );

  // Early script injected right after <head> — runs before any page scripts
  const earlyScript = `<script>
(function() {
  var FINAL_URL = ${JSON.stringify(finalUrl)};
  var BASE = ${JSON.stringify(base)};

  function makeProxy(url) {
    if (!url || typeof url !== 'string') return url;
    url = url.trim();
    if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('tel:')) return url;
    if (url.startsWith('/proxy/')) return url;
    try {
      var abs = new URL(url, FINAL_URL).href;
      return '/proxy/' + encodeURIComponent(abs);
    } catch(e) { return url; }
  }

  // Intercept element src/href property assignments via prototype
  function interceptProp(proto, prop) {
    var desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set) return;
    Object.defineProperty(proto, prop, {
      get: desc.get,
      set: function(val) { desc.set.call(this, makeProxy(val)); },
      configurable: true
    });
  }
  interceptProp(HTMLImageElement.prototype, 'src');
  interceptProp(HTMLScriptElement.prototype, 'src');
  interceptProp(HTMLIFrameElement.prototype, 'src');
  interceptProp(HTMLSourceElement.prototype, 'src');
  interceptProp(HTMLVideoElement.prototype, 'src');
  interceptProp(HTMLAudioElement.prototype, 'src');
  interceptProp(HTMLLinkElement.prototype, 'href');
  interceptProp(HTMLAnchorElement.prototype, 'href');

  // MutationObserver to catch dynamically added/modified elements
  var WATCH_ATTRS = ['src', 'href', 'data-src', 'poster', 'data-original', 'data-lazy-src'];
  function rewriteEl(el) {
    if (!el || !el.getAttribute) return;
    WATCH_ATTRS.forEach(function(attr) {
      var val = el.getAttribute(attr);
      if (val && !val.startsWith('/proxy/') && !val.startsWith('data:') && !val.startsWith('blob:') && !val.startsWith('#') && !val.startsWith('javascript:')) {
        var proxied = makeProxy(val);
        if (proxied !== val) el.setAttribute(attr, proxied);
      }
    });
    if (el.style && el.style.backgroundImage) {
      el.style.backgroundImage = el.style.backgroundImage.replace(
        /url\(["']?([^"')]+)["']?\)/g,
        function(m, u) { var p = makeProxy(u); return p !== u ? "url('" + p + "')" : m; }
      );
    }
  }

  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          rewriteEl(node);
          if (node.querySelectorAll) {
            node.querySelectorAll('[src],[href],[data-src],[poster]').forEach(rewriteEl);
          }
        }
      });
      if (mutation.type === 'attributes') rewriteEl(mutation.target);
    });
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: WATCH_ATTRS
  });

  // Intercept fetch()
  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') input = makeProxy(input);
    return _fetch.call(this, input, init);
  };

  // Intercept XMLHttpRequest
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = makeProxy(url);
    return _xhrOpen.apply(this, args);
  };

  // Intercept history
  var _push = history.pushState.bind(history);
  var _replace = history.replaceState.bind(history);
  history.pushState = function(s, t, url) { return _push(s, t, url ? makeProxy(url) : url); };
  history.replaceState = function(s, t, url) { return _replace(s, t, url ? makeProxy(url) : url); };

  // Intercept window.open
  var _winOpen = window.open;
  window.open = function(url) {
    var args = Array.prototype.slice.call(arguments);
    args[0] = makeProxy(url);
    return _winOpen.apply(this, args);
  };

  // Intercept all link clicks
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('/proxy/')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.location.href = makeProxy(href);
  }, true);

  // Intercept location
  try {
    var _loc = window.location;
    var _assign = _loc.assign.bind(_loc);
    var _locReplace = _loc.replace.bind(_loc);
    _loc.assign = function(url) { _assign(makeProxy(url)); };
    _loc.replace = function(url) { _locReplace(makeProxy(url)); };
  } catch(e) {}

})();
</script>`;

  body = body.replace(/<head([^>]*)>/i, `<head$1>${earlyScript}`);

  return body;
}

// Rewrite CSS files on the fly
function rewriteCss(css, finalUrl) {
  css = css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, quote, rawUrl) => {
      const url = rawUrl.trim();
      if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/proxy/')) return match;
      const abs = toAbsolute(url, finalUrl);
      return abs ? `url('/proxy/${encodeURIComponent(abs)}')` : match;
    }
  );

  css = css.replace(
    /@import\s+(['"])([^'"]+)\1/gi,
    (match, quote, url) => {
      if (url.startsWith('/proxy/')) return match;
      const abs = toAbsolute(url, finalUrl);
      return abs ? `@import ${quote}/proxy/${encodeURIComponent(abs)}${quote}` : match;
    }
  );

  css = css.replace(
    /@import\s+url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, quote, url) => {
      if (url.startsWith('/proxy/')) return match;
      const abs = toAbsolute(url, finalUrl);
      return abs ? `@import url('/proxy/${encodeURIComponent(abs)}')` : match;
    }
  );

  return css;
}

router.get('/:encodedUrl(*)', async (req, res) => {
  let input = decodeURIComponent(req.params.encodedUrl).trim();

  const looksLikeUrl = /^(https?:\/\/)?[\w\-]+(\.[\w\-]+)+(\/.*)?(\?.*)?$/.test(input);
  if (!looksLikeUrl) {
    input = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(input);
  } else if (!/^https?:\/\//i.test(input)) {
    input = 'https://' + input;
  }

  try {
    const response = await fetch(input, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const finalUrl = response.url;
    const contentType = response.headers.get('content-type') || 'text/html';

    if (contentType.includes('text/css')) {
      let css = await response.text();
      css = rewriteCss(css, finalUrl);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(css);
    }

    if (!contentType.includes('text/html')) {
      const buffer = await response.buffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    }

    let body = await response.text();
    body = rewriteHtml(body, finalUrl);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(body);

  } catch (err) {
    const searchUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(input);
    return res.redirect('/proxy/' + encodeURIComponent(searchUrl));
  }
});

module.exports = router;
