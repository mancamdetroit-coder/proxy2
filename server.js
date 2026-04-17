const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const { db } = require('./db');
const { loadUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Trust Render's proxy (required for secure cookies) ───────────
app.set('trust proxy', 1);

// ─── Session ──────────────────────────────────────────────────────
app.use(session({
  store: new SQLiteStore({ client: db }),
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
app.use(loadUser);

const mainRoutes = require('./routes/index');
app.use('/', mainRoutes);

app.listen(PORT, () => {
  console.log(`✅ Hamshchos running on port ${PORT}`);
});
