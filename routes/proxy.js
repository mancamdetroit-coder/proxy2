const express = require('express');
const app = express();

// Middleware to handle redirects and rewrites
app.use((req, res, next) => {
    const url = req.url;

    // Handle redirects
    if (url.startsWith('/old-path')) {
        return res.redirect(301, '/new-path');
    }

    // Rewrite JavaScript URLs
    if (url.endsWith('.js')) {
        req.url = '/scripts' + url;
    }

    // Support for Google and YouTube URLs
    if (url.includes('google.com') || url.includes('youtube.com')) {
        return res.redirect(307, 'https://www.' + req.headers.host + url);
    }

    next();
});

// Your existing routes here

app.listen(3000, () => {
    console.log('Proxy server running on port 3000');
});
