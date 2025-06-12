// Serveur HTTP simple sans Express
const http = require('http');
const fs = require('fs');
const url = require('url');
const { authenticate, getUserIdFromToken } = require('./auth');

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/login') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const { username, password } = JSON.parse(body);
      const token = authenticate(username, password);
      if (token) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token }));
      } else {
        res.writeHead(401);
        res.end('Unauthorized');
      }
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bienvenue dans le gestionnaire de fichiers !');
  }
});

server.listen(3000, () => {
  console.log('Serveur démarré sur http://localhost:3000');
});
