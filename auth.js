const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const usersPath = path.join(__dirname, 'users.json');
let sessions = {};

function authenticate(username, password) {
  try {
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) return null;

    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = {
      userId: user.id,
      createdAt: Date.now()
    };
    
    cleanExpiredTokens();
    
    return token;
  } catch (error) {
    console.error('Erreur authentification:', error);
    return null;
  }
}

function getUserIdFromToken(token) {
  const session = sessions[token];
  if (!session) return null;
  
  const EXPIRY_TIME = 24 * 60 * 60 * 1000;
  if (Date.now() - session.createdAt > EXPIRY_TIME) {
    delete sessions[token];
    return null;
  }
  
  return session.userId;
}

function cleanExpiredTokens() {
  const EXPIRY_TIME = 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  Object.keys(sessions).forEach(token => {
    if (now - sessions[token].createdAt > EXPIRY_TIME) {
      delete sessions[token];
    }
  });
}

function logout(token) {
  delete sessions[token];
}

module.exports = { 
  authenticate, 
  getUserIdFromToken, 
  logout 
};