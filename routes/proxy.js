const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.get('/:encodedUrl(*)', async (req, res) => {
  let input = decodeURIComponent(req.params.encodedUrl).trim();

  // If it looks like a search query (not a URL), send straight to Google search
  const looksLikeUrl = /^(https?:\/\/)?[\w\-]+(\.[\w\-]+)+(\/.*)?(\?.*)?$/.test(input);
  if (!looksLikeUrl) {
    input = 'https://www.google.com/search?q=' + encodeURIComponent(input);
  } else if (!/^https?:\/\//i.test(input)) {
    input = 'https://' + input;
  }

  try {
    const response = await fetch(input, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const finalUrl = response.url;
    const base = new URL(finalUrl).origin;
    const contentType = response.headers.get('content-type') || 'text/html';

    if (!contentType.includes('text/html')) {
      const buffer = await response.buffer();
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }

    let body = await response.text();

    // Inject base tag so CSS/images/fonts load from real site
    body = body.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="${finalUrl}">` 
    );

    // Rewrite <a href> absolute links
    body = body.replace(
      /<a\s([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/gi,
      (match, before, url, after) => `<a ${before}href="/proxy/${encodeURIComponent(url)}"${after}>`
    );

    // Rewrite <a href> relative links
    body = body.replace(
      /<a\s([^>]*?)href="(\/[^"]+)"([^>]*?)>/gi,
      (match, before, path, after) => `<a ${before}href="/proxy/${encodeURIComponent(base + path)}"${after}>`
    );

    // Rewrite data-href (used by Google search results)
    body = body.replace(
      /data-href="(https?:\/\/[^"]+)"/gi,
      (match, url) => `data-href="/proxy/${encodeURIComponent(url)}"`
    );

    // Inject script to intercept JS-based navigation (window.location, etc)
    const interceptScript = `
<script>
(function() {
  // Intercept window.location changes
  const origAssign = window.location.assign.bind(window.location);
  const origReplace = window.location.replace.bind(window.location);
  
  function proxyUrl(url) {
    if (!url) return url;
    try {
      const abs = new URL(url, '${finalUrl}').href;
      return '/proxy/' + encodeURIComponent(abs);
    } catch(e) { return url; }
  }

  Object.defineProperty(window, 'location', {
    get: function() { return window._location || location; },
    configurable: true
  });

  // Intercept all link clicks including Google's JS-driven ones
  document.addEventListener('click', function(e) {
    const a = e.target.closest('a');
    if (a) {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('/proxy/') && !href.startsWith('#')) {
        e.preventDefault();
        try {
          const abs = new URL(href, '${finalUrl}').href;
          window.location.href = '/proxy/' + encodeURIComponent(abs);
        } catch(err) {}
      }
    }
  }, true);
})();
</script>`;

    // Inject intercept script right before </body>
    body = body.replace('</body>', interceptScript + '</body>');

    res.setHeader('Content-Type', contentType);
    res.send(body);

  } catch (err) {
    // On any fetch failure, search Google instead
    const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(input);
    return res.redirect('/proxy/' + encodeURIComponent(searchUrl));
  }
});

module.exports = router;
