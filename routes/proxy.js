const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

function toProxyUrl(url, base) {
  try {
    const abs = new URL(url, base).href;
    return '/proxy/' + encodeURIComponent(abs);
  } catch(e) { return null; }
}

function rewriteHtml(body, finalUrl) {
  const base = new URL(finalUrl).origin;

  // Inject base tag + a <style> override to catch any remaining relative CSS urls
  body = body.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="${finalUrl}">`
  );

  // Rewrite ALL href/src/action/srcset with absolute URLs
  body = body.replace(
    /(href|src|action|data-src|data-href)="(https?:\/\/[^"]+)"/gi,
    (match, attr, url) => `${attr}="/proxy/${encodeURIComponent(url)}"`
  );

  // Rewrite root-relative URLs
  body = body.replace(
    /(href|src|action|data-src)="(\/[^/"'][^"]*?)"/gi,
    (match, attr, path) => {
      // Skip anchors and already-proxied
      if (path.startsWith('/proxy/')) return match;
      return `${attr}="/proxy/${encodeURIComponent(base + path)}"`;
    }
  );

  // Rewrite srcset attributes (comma-separated list of URLs)
  body = body.replace(
    /srcset="([^"]+)"/gi,
    (match, srcset) => {
      const rewritten = srcset.replace(/(https?:\/\/[^\s,]+)/g, url => {
        return '/proxy/' + encodeURIComponent(url);
      });
      return `srcset="${rewritten}"`;
    }
  );

  // Rewrite inline style url() references (all formats)
  body = body.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, quote, rawUrl) => {
      const url = rawUrl.trim();
      if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/proxy/')) return match;
      try {
        const abs = new URL(url, finalUrl).href;
        return `url('/proxy/${encodeURIComponent(abs)}')`;
      } catch(e) { return match; }
    }
  );

  // Inject click + navigation interceptor before </body>
  const script = `
<script>
(function() {
  const FINAL_URL = ${JSON.stringify(finalUrl)};
  const BASE_ORIGIN = ${JSON.stringify(base)};

  function makeProxy(url) {
    if (!url) return url;
    if (url.startsWith('#') || url.startsWith('javascript') || url.startsWith('mailto:') || url.startsWith('tel:')) return url;
    if (url.startsWith('/proxy/')) return url;
    try {
      const abs = new URL(url, FINAL_URL).href;
      return '/proxy/' + encodeURIComponent(abs);
    } catch(e) { return url; }
  }

  // Intercept all clicks on links
  document.addEventListener('click', function(e) {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
    if (href.startsWith('/proxy/')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.location.href = makeProxy(href);
  }, true);

  // Intercept fetch() calls
  const _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string' && !input.startsWith('/proxy/') && (input.startsWith('http') || input.startsWith('/'))) {
      input = makeProxy(input);
    }
    return _fetch.call(this, input, init);
  };

  // Intercept XMLHttpRequest
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (typeof url === 'string' && !url.startsWith('/proxy/') && (url.startsWith('http') || url.startsWith('/'))) {
      url = makeProxy(url);
    }
    return _open.call(this, method, url, ...rest);
  };

  // Intercept window.location.assign / replace
  const desc = Object.getOwnPropertyDescriptor(window, 'location');
  if (!desc || desc.configurable) {
    const _loc = window.location;
    const handler = {
      get(t, p) {
        if (p === 'assign') return function(url) { window.location.href = makeProxy(url); };
        if (p === 'replace') return function(url) { window.location.href = makeProxy(url); };
        if (p === 'href') return _loc.href;
        const val = t[p];
        return typeof val === 'function' ? val.bind(t) : val;
      },
      set(t, p, v) {
        if (p === 'href') {
          window.top.location.href = makeProxy(v);
          return true;
        }
        t[p] = v;
        return true;
      }
    };
    try {
      Object.defineProperty(window, 'location', {
        get: () => new Proxy(_loc, handler),
        configurable: true
      });
    } catch(e) {}
  }

  // Intercept history.pushState / replaceState
  const _push = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);
  history.pushState = function(state, title, url) {
    if (url) url = makeProxy(url);
    return _push(state, title, url);
  };
  history.replaceState = function(state, title, url) {
    if (url) url = makeProxy(url);
    return _replace(state, title, url);
  };

})();
</script>`;

  body = body.replace(/<\/body>/i, script + '</body>');
  return body;
}

// Rewrite CSS files on the fly
function rewriteCss(css, finalUrl) {
  const base = new URL(finalUrl).origin;

  // Rewrite ALL url() references — absolute, root-relative, and relative paths
  css = css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, quote, rawUrl) => {
      const url = rawUrl.trim();
      if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/proxy/')) return match;
      try {
        // new URL handles absolute, root-relative (/path), and relative (../fonts/x.woff2)
        const abs = new URL(url, finalUrl).href;
        return `url('/proxy/${encodeURIComponent(abs)}')`;
      } catch(e) {
        return match;
      }
    }
  );

  // Also rewrite @import "url" statements
  css = css.replace(
    /@import\s+(['"])([^'"]+)\1/gi,
    (match, quote, url) => {
      if (url.startsWith('/proxy/')) return match;
      try {
        const abs = new URL(url, finalUrl).href;
        return `@import ${quote}/proxy/${encodeURIComponent(abs)}${quote}`;
      } catch(e) {
        return match;
      }
    }
  );

  return css;
}

router.get('/:encodedUrl(*)', async (req, res) => {
  let input = decodeURIComponent(req.params.encodedUrl).trim();

  // If not a URL, search on DuckDuckGo (simple HTML, no JS tricks)
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

    // Rewrite CSS on the fly
    if (contentType.includes('text/css')) {
      let css = await response.text();
      css = rewriteCss(css, finalUrl);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(css);
    }

    // Pass through all other non-HTML (images, fonts, JS, etc.)
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
