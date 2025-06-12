// Authentification simple via fichier users.json
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const usersPath = path.join(__dirname, 'users.json');
let sessions = {}; // token -> userId

function authenticate(username, password) {
  const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return null;

  const token = `${user.id}|${Date.now()}`;
  sessions[token] = user.id;
  return token;
}

function getUserIdFromToken(token) {
  return sessions[token] || null;
}

module.exports = { authenticate, getUserIdFromToken };
