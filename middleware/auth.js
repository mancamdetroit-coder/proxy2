const { getUserById } = require('../db');
const path = require('path');

function loadUser(req, res, next) {
  if (req.session && req.session.userId) {
    const user = getUserById(req.session.userId);
    if (user) {
      req.user = user;
    } else {
      req.session.destroy();
    }
  }
  next();
}

function requireLogin(req, res, next) {
  if (!req.user) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
  }
  next();
}

function requirePageAccess(pagePath) {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    if (req.user.role === 'admin') return next();
    const hasAccess = req.user.pages && req.user.pages.some(p => req.originalUrl.startsWith(p.path));
    if (!hasAccess) {
      return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
    }
    next();
  };
}

function canRemove(actor, target) {
  if (!actor.can_remove_users) return false;
  if (target.role === 'admin') return false;
  if (actor.role === 'admin') return true;
  if (actor.remove_scope === 'own') return target.created_by === actor.id;
  if (actor.remove_scope === 'all') return target.created_by !== null && target.role !== 'admin';
  return false;
}

module.exports = { loadUser, requireLogin, requireAdmin, requirePageAccess, canRemove };
