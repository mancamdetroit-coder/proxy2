const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const router = express.Router();

// Proxy for Google
router.use('/google', createProxyMiddleware({
    target: 'https://www.google.com',
    changeOrigin: true,
}));

// Proxy for YouTube
router.use('/youtube', createProxyMiddleware({
    target: 'https://www.youtube.com',
    changeOrigin: true,
}));

module.exports = router;