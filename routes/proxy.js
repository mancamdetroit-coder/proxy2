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

  // Inject base tag for CSS/images/fonts
  body = body.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="${finalUrl}">`
  );

  // Rewrite ALL href and src attributes
  body = body.replace(
    /(href|src|action)="(https?:\/\/[^"]+)"/gi,
    (match, attr, url) => `${attr}="/proxy/${encodeURIComponent(url)}"`
  );
  body = body.replace(
    /(href|src|action)="(\/[^/"'][^"]*?)"/gi,
    (match, attr, path) => `${attr}="/proxy/${encodeURIComponent(base + path)}"`
  );

  // Inject click interceptor before </body>
  const script = `
<script>
(function() {
  document.addEventListener('click', function(e) {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
    if (href.startsWith('/proxy/')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    try {
      const abs = new URL(href, '${finalUrl}').href;
      window.location.href = '/proxy/' + encodeURIComponent(abs);
    } catch(err) {}
  }, true);

  // Intercept window.location assignments
  const desc = Object.getOwnPropertyDescriptor(window, 'location');
  if (!desc || desc.configurable) {
    let _href = window.location.href;
    const handler = {
      get(t, p) {
        if (p === 'href') return _href;
        if (p === 'assign' || p === 'replace') return function(url) {
          try {
            const abs = new URL(url, '${finalUrl}').href;
            window.location.href = '/proxy/' + encodeURIComponent(abs);
          } catch(e) {}
        };
        return typeof t[p] === 'function' ? t[p].bind(t) : t[p];
      },
      set(t, p, v) {
        if (p === 'href') {
          try {
            const abs = new URL(v, '${finalUrl}').href;
            window.top.location.href = '/proxy/' + encodeURIComponent(abs);
          } catch(e) {}
          return true;
        }
        t[p] = v; return true;
      }
    };
  }
})();
</script>`;

  body = body.replace('</body>', script + '</body>');
  return body;
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

    if (!contentType.includes('text/html')) {
      const buffer = await response.buffer();
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }

    let body = await response.text();
    body = rewriteHtml(body, finalUrl);

    res.setHeader('Content-Type', contentType);
    res.send(body);

  } catch (err) {
    // On failure, search DuckDuckGo
    const searchUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(input);
    return res.redirect('/proxy/' + encodeURIComponent(searchUrl));
  }
});

module.exports = router;
