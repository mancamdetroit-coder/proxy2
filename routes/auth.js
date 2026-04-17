const express = require('express');
const router = express.Router();
const path = require('path');
const bcrypt = require('bcrypt');
const { getUserByUsername } = require('../db');

const LOGIN_PAGE = path.join(__dirname, '../public/login/index.html');

// Show login page
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.sendFile(LOGIN_PAGE);
});

// Handle login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.redirect('/login?error=missing');
  }
  const user = getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.redirect('/login?error=invalid');
  }
  req.session.userId = user.id;
  const next = req.query.next || '/';
  res.redirect(next);
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
