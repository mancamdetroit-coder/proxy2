const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

// Enable WAL mode for better performance and safety
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',        -- 'admin' or 'user'
    created_by INTEGER,                        -- id of user who created them
    can_add_users INTEGER NOT NULL DEFAULT 0,
    can_add_users_who_add INTEGER NOT NULL DEFAULT 0,  -- can give canAddUsers to new users
    can_remove_users INTEGER NOT NULL DEFAULT 0,
    remove_scope TEXT NOT NULL DEFAULT 'own', -- 'own' or 'all'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,          -- display name e.g. "Proxy"
    path TEXT UNIQUE NOT NULL,   -- e.g. "/proxy"
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS user_page_access (
    user_id INTEGER NOT NULL,
    page_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, page_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
  );
`);

// Seed default pages
const insertPage = db.prepare(`
  INSERT OR IGNORE INTO pages (name, path, description) VALUES (?, ?, ?)
`);
insertPage.run('Proxy', '/proxy', 'Web proxy tool');

// Seed admin account if it doesn't exist
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 12);
  db.prepare(`
    INSERT INTO users (username, password, role, can_add_users, can_add_users_who_add, can_remove_users, remove_scope)
    VALUES (?, ?, 'admin', 1, 1, 1, 'all')
  `).run('admin', hash);

  // Give admin access to all pages
  const adminId = db.prepare('SELECT id FROM users WHERE role = ?').get('admin').id;
  const pages = db.prepare('SELECT id FROM pages').all();
  const grantPage = db.prepare('INSERT OR IGNORE INTO user_page_access (user_id, page_id) VALUES (?, ?)');
  for (const page of pages) {
    grantPage.run(adminId, page.id);
  }

  console.log('✅ Admin account created: admin / admin123 — CHANGE THIS PASSWORD!');
}

// Helper: get full user with page access
function getUserById(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return null;
  user.pages = db.prepare(`
    SELECT p.* FROM pages p
    JOIN user_page_access upa ON upa.page_id = p.id
    WHERE upa.user_id = ?
  `).all(id);
  return user;
}

function getUserByUsername(username) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return null;
  user.pages = db.prepare(`
    SELECT p.* FROM pages p
    JOIN user_page_access upa ON upa.page_id = p.id
    WHERE upa.user_id = ?
  `).all(user.id);
  return user;
}

function getAllUsers() {
  return db.prepare('SELECT id, username, role, created_by, can_add_users, can_add_users_who_add, can_remove_users, remove_scope, created_at FROM users').all();
}

function getAllPages() {
  return db.prepare('SELECT * FROM pages').all();
}

function getUserPages(userId) {
  return db.prepare(`
    SELECT p.* FROM pages p
    JOIN user_page_access upa ON upa.page_id = p.id
    WHERE upa.user_id = ?
  `).all(userId);
}

function createUser({ username, password, createdBy, canAddUsers, canAddUsersWhoAdd, canRemoveUsers, removeScope, pageIds }) {
  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(`
    INSERT INTO users (username, password, role, created_by, can_add_users, can_add_users_who_add, can_remove_users, remove_scope)
    VALUES (?, ?, 'user', ?, ?, ?, ?, ?)
  `).run(username, hash, createdBy, canAddUsers ? 1 : 0, canAddUsersWhoAdd ? 1 : 0, canRemoveUsers ? 1 : 0, removeScope || 'own');

  const newId = result.lastInsertRowid;
  const grantPage = db.prepare('INSERT OR IGNORE INTO user_page_access (user_id, page_id) VALUES (?, ?)');
  for (const pid of (pageIds || [])) {
    grantPage.run(newId, pid);
  }
  return newId;
}

function updateUser(id, { canAddUsers, canAddUsersWhoAdd, canRemoveUsers, removeScope, pageIds }) {
  db.prepare(`
    UPDATE users SET
      can_add_users = ?,
      can_add_users_who_add = ?,
      can_remove_users = ?,
      remove_scope = ?
    WHERE id = ?
  `).run(canAddUsers ? 1 : 0, canAddUsersWhoAdd ? 1 : 0, canRemoveUsers ? 1 : 0, removeScope || 'own', id);

  db.prepare('DELETE FROM user_page_access WHERE user_id = ?').run(id);
  const grantPage = db.prepare('INSERT OR IGNORE INTO user_page_access (user_id, page_id) VALUES (?, ?)');
  for (const pid of (pageIds || [])) {
    grantPage.run(id, pid);
  }
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function addPage({ name, path, description }) {
  return db.prepare('INSERT OR IGNORE INTO pages (name, path, description) VALUES (?, ?, ?)').run(name, path, description);
}

function updatePageAccess(userId, pageIds) {
  db.prepare('DELETE FROM user_page_access WHERE user_id = ?').run(userId);
  const grant = db.prepare('INSERT OR IGNORE INTO user_page_access (user_id, page_id) VALUES (?, ?)');
  for (const pid of pageIds) grant.run(userId, pid);
}

module.exports = {
  db,
  getUserById,
  getUserByUsername,
  getAllUsers,
  getAllPages,
  getUserPages,
  createUser,
  updateUser,
  deleteUser,
  addPage,
  updatePageAccess,
};
