const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
    app.use('/api/google', createProxyMiddleware({
        target: 'https://www.googleapis.com',
        changeOrigin: true,
        pathRewrite: {
            '^/api/google': '',
        },
        onProxyRes: function(proxyRes, req, res) {
            delete proxyRes.headers['content-security-policy'];
        },
        followRedirects: true
    }));

    app.use('/api/youtube', createProxyMiddleware({
        target: 'https://www.youtube.com',
        changeOrigin: true,
        pathRewrite: {
            '^/api/youtube': '',
        },
        onProxyRes: function(proxyRes, req, res) {
            delete proxyRes.headers['content-security-policy'];
        },
        followRedirects: true
    }));
};
