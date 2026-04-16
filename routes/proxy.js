const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.use(async (req, res) => {
  try {
    let target = req.query.url || req.path.slice(1);

    if (!target) {
      return res.redirect('/proxy/');
    }

    // Auto Google search for plain text
    if (!target.startsWith('http') && !target.includes('.')) {
      target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
    } else if (!target.startsWith('http')) {
      target = 'https://' + target;
    }

    console.log('Proxying →', target);

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get('content-type') || 'text/html';
    res.set('Content-Type', contentType);

    let body = await response.text();

    const base = '/proxy/';

    // Stronger attribute rewriting (handles more cases)
    body = body.replace(/(href|src|action|data-src|data-original|poster|data-lazy|data-srcset)=(["'])(.*?)\2/gi, (match, attr, quote, url) => {
      if (!url || url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('blob:') || url.startsWith('tel:') || url.startsWith('mailto:')) {
        return match;
      }

      try {
        let fullUrl;
        if (url.startsWith('http') || url.startsWith('//')) {
          fullUrl = url.startsWith('//') ? 'https:' + url : url;
        } else {
          // All relative URLs (/, ./, ../, or just filename)
          const urlObj = new URL(target);
          fullUrl = new URL(url, urlObj.origin).toString();
        }

        const clean = fullUrl.replace(/^https?:\/\//, '');
        return `${attr}=${quote}${base}${clean}${quote}`;
      } catch (e) {
        return match;
      }
    });

    // Fix srcset (very important for images)
    body = body.replace(/srcset=(["'])(.*?)\1/gi, (match, quote, srcset) => {
      const newSrcset = srcset.split(',').map(item => {
        const trimmed = item.trim();
        const spaceIndex = trimmed.search(/\s+/);
        let urlPart = spaceIndex > 0 ? trimmed.substring(0, spaceIndex) : trimmed;
        let rest = spaceIndex > 0 ? trimmed.substring(spaceIndex) : '';

        try {
          let fullUrl;
          if (urlPart.startsWith('http') || urlPart.startsWith('//')) {
            fullUrl = urlPart.startsWith('//') ? 'https:' + urlPart : urlPart;
          } else {
            const urlObj = new URL(target);
            fullUrl = new URL(urlPart, urlObj.origin).toString();
          }

          const clean = fullUrl.replace(/^https?:\/\//, '');
          return base + clean + rest;
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
      <p>${err.message}</p>
      <a href="/proxy/">← Back to Proxy</a>
    `);
  }
});

module.exports = router;
