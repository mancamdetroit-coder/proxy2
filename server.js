const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const { db } = require('./db');
const { loadUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Session ───────────────────────────────────────────────────────
app.use(session({
  store: new SQLiteStore({ client: db }),
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // No maxAge = expires on browser close
  }
}));

// ─── Body parsing ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static files ─────────────────────────────────────────────────
app.use(express.static('public'));

// ─── Load user on every request ──────────────────────────────────
app.use(loadUser);

// ─── Routes ──────────────────────────────────────────────────────
const mainRoutes = require('./routes/index');
app.use('/', mainRoutes);

app.listen(PORT, () => {
  console.log(`✅ Hamshchos running on port ${PORT}`);
});
