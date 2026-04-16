const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.use(async (req, res) => {
  try {
    let target = req.query.url || req.path.slice(1);

    if (!target) {
      return res.redirect('/proxy/');
    }

    // Auto Google search if no valid domain
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

    // Base for rewriting
    const base = '/proxy/';

    // Improved rewriting for images, links, scripts, etc.
    body = body.replace(/(href|src|action|data-src|data-original|poster|srcset)=["']([^"']*)["']/gi, (match, attr, url) => {
      if (!url || url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('blob:')) {
        return match;
      }

      try {
        // Full absolute URL
        if (url.startsWith('http') || url.startsWith('//')) {
          const clean = url.replace(/^https?:\/\//, '');
          return `${attr}="${base}${clean}"`;
        }

        // Relative URL starting with /
        if (url.startsWith('/')) {
          const origin = new URL(target).origin.replace(/^https?:\/\//, '');
          return `${attr}="${base}${origin}${url}"`;
        }

        // Other relative URLs
        const origin = new URL(target).origin.replace(/^https?:\/\//, '');
        return `${attr}="${base}${origin}/${url}"`;
      } catch (e) {
        return match;
      }
    });

    // Fix srcset (important for images on many sites)
    body = body.replace(/srcset="([^"]*)"/gi, (match, srcset) => {
      const newSrcset = srcset.split(',').map(item => {
        const parts = item.trim().split(/\s+/);
        let urlPart = parts[0];
        if (urlPart.startsWith('http') || urlPart.startsWith('//')) {
          const clean = urlPart.replace(/^https?:\/\//, '');
          parts[0] = base + clean;
        } else if (urlPart.startsWith('/')) {
          const origin = new URL(target).origin.replace(/^https?:\/\//, '');
          parts[0] = base + origin + urlPart;
        }
        return parts.join(' ');
      }).join(', ');
      return `srcset="${newSrcset}"`;
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
