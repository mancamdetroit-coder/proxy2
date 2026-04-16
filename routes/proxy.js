const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.use(async (req, res) => {
  try {
    let target = req.query.url || req.path.slice(1);

    if (!target) {
      return res.redirect('/proxy/');
    }

    // Auto Google search if it doesn't look like a domain
    if (!target.startsWith('http') && !target.includes('.')) {
      target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
    } else if (!target.startsWith('http')) {
      target = 'https://' + target;
    }

    console.log('Proxying →', target);

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get('content-type') || 'text/html';
    res.set('Content-Type', contentType);

    let body = await response.text();

    const base = '/proxy/';

    // Stronger rewriting for links, images, scripts, etc.
    body = body.replace(/(href|src|action|data-src|data-original|poster|srcset)=(["'])(.*?)\2/gi, (match, attr, quote, url) => {
      if (!url || url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('blob:') || url.startsWith('tel:') || url.startsWith('mailto:')) {
        return match;
      }

      try {
        let fullUrl;
        if (url.startsWith('http') || url.startsWith('//')) {
          fullUrl = url.startsWith('//') ? 'https:' + url : url;
        } else if (url.startsWith('/')) {
          // Relative root path
          const origin = new URL(target).origin;
          fullUrl = origin + url;
        } else {
          // Other relative paths
          const origin = new URL(target).origin;
          fullUrl = origin + '/' + url;
        }

        const clean = fullUrl.replace(/^https?:\/\//, '');
        return `${attr}=${quote}${base}${clean}${quote}`;
      } catch (e) {
        return match;
      }
    });

    // Fix srcset for responsive images
    body = body.replace(/srcset=(["'])(.*?)\1/gi, (match, quote, srcset) => {
      const newSrcset = srcset.split(',').map(item => {
        const trimmed = item.trim();
        const parts = trimmed.split(/\s+/);
        let urlPart = parts[0];

        try {
          let fullUrl;
          if (urlPart.startsWith('http') || urlPart.startsWith('//')) {
            fullUrl = urlPart.startsWith('//') ? 'https:' + urlPart : urlPart;
          } else if (urlPart.startsWith('/')) {
            const origin = new URL(target).origin;
            fullUrl = origin + urlPart;
          } else {
            const origin = new URL(target).origin;
            fullUrl = origin + '/' + urlPart;
          }

          const clean = fullUrl.replace(/^https?:\/\//, '');
          parts[0] = base + clean;
          return parts.join(' ');
        } catch (e) {
          return trimmed;
        }
      }).join(', ');

      return `srcset=${quote}${newSrcset}${quote}`;
    });

    res.send(body);

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).send(`
      <h1>Proxy Error</h1>
      <p>Could not load the page: ${err.message}</p>
      <p><a href="/proxy/">← Back to Proxy</a></p>
    `);
  }
});

module.exports = router;
