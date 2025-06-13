const http = require('http');
const url = require('url');
const { authenticate, getUserIdFromToken, logout } = require('./auth');
const fileManager = require('./fileManager');
const { notifyClients } = require('./websocket');

fileManager.initDirectories();

function parseJsonBody(req, callback) {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      callback(null, data);
    } catch (error) {
      callback(error, null);
    }
  });
}

function parseMultipart(req, callback) {
  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) {
    return callback(new Error('Boundary manquant'), null);
  }
  
  let body = Buffer.alloc(0);
  req.on('data', chunk => {
    body = Buffer.concat([body, chunk]);
  });
  
  req.on('end', () => {
    try {
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      const parts = [];
      let start = 0;
      
      while (true) {
        const boundaryIndex = body.indexOf(boundaryBuffer, start);
        if (boundaryIndex === -1) break;
        
        if (start > 0) {
          const part = body.slice(start, boundaryIndex);
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const headers = part.slice(0, headerEnd).toString();
            const content = part.slice(headerEnd + 4, part.length - 2);
            
            const nameMatch = headers.match(/name="([^"]+)"/);
            const filenameMatch = headers.match(/filename="([^"]+)"/);
            
            if (nameMatch) {
              parts.push({
                name: nameMatch[1],
                filename: filenameMatch ? filenameMatch[1] : null,
                content: content
              });
            }
          }
        }
        
        start = boundaryIndex + boundaryBuffer.length + 2;
      }
      
      callback(null, parts);
    } catch (error) {
      callback(error, null);
    }
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function requireAuth(req, res, callback) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendJson(res, 401, { error: 'Token manquant' });
  }
  
  const token = authHeader.substring(7);
  const userId = getUserIdFromToken(token);
  
  if (!userId) {
    return sendJson(res, 401, { error: 'Token invalide' });
  }
  
  callback(userId);
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }
  
  console.log(`${method} ${pathname}`);
  
  if (method === 'POST' && pathname === '/login') {
    parseJsonBody(req, (error, data) => {
      if (error) {
        return sendJson(res, 400, { error: 'JSON invalide' });
      }
      
      const { username, password } = data;
      if (!username || !password) {
        return sendJson(res, 400, { error: 'Username et password requis' });
      }
      
      const token = authenticate(username, password);
      if (token) {
        sendJson(res, 200, { 
          token, 
          message: 'Connexion réussie' 
        });
      } else {
        sendJson(res, 401, { error: 'Identifiants invalides' });
      }
    });
  }

  else if (method === 'GET' && pathname.startsWith('/shared/download/')) {
    requireAuth(req, res, (userId) => {
      const filename = decodeURIComponent(pathname.substring(17));
      const file = fileManager.getSharedFile(filename);
      
      if (!file) {
        return sendJson(res, 404, { error: 'Fichier partagé non trouvé' });
      }
      
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': file.stats.size,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(file.buffer);
    });
  }
  
  else if (method === 'POST' && pathname === '/logout') {
    requireAuth(req, res, () => {
      const token = req.headers.authorization.substring(7);
      logout(token);
      sendJson(res, 200, { message: 'Déconnexion réussie' });
    });
  }
  
  else if (method === 'GET' && pathname === '/files') {
    requireAuth(req, res, (userId) => {
      const files = fileManager.listUserFiles(userId);
      sendJson(res, 200, { files });
    });
  }
  
  else if (method === 'POST' && pathname === '/upload') {
    requireAuth(req, res, (userId) => {
      parseMultipart(req, (error, parts) => {
        if (error) {
          return sendJson(res, 400, { error: 'Erreur parsing fichier' });
        }
        
        const filePart = parts.find(p => p.filename);
        if (!filePart) {
          return sendJson(res, 400, { error: 'Fichier manquant' });
        }
        
        const result = fileManager.saveFile(userId, filePart.filename, filePart.content);
        
        if (result.success) {
          notifyClients({
            type: 'file_uploaded',
            userId,
            filename: filePart.filename,
            size: filePart.content.length
          });
          
          sendJson(res, 200, { 
            message: 'Fichier uploadé avec succès',
            filename: filePart.filename 
          });
        } else {
          sendJson(res, 500, { error: result.error });
        }
      });
    });
  }
  
  else if (method === 'GET' && pathname.startsWith('/download/')) {
    requireAuth(req, res, (userId) => {
      const filename = decodeURIComponent(pathname.substring(10));
      const file = fileManager.getFile(userId, filename);
      
      if (!file) {
        return sendJson(res, 404, { error: 'Fichier non trouvé' });
      }
      
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': file.stats.size,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(file.buffer);
    });
  }
  
  else if (method === 'DELETE' && pathname.startsWith('/files/')) {
    requireAuth(req, res, (userId) => {
      const filename = decodeURIComponent(pathname.substring(7));
      const success = fileManager.deleteFile(userId, filename);
      
      if (success) {
        notifyClients({
          type: 'file_deleted',
          userId,
          filename
        });
        
        sendJson(res, 200, { message: 'Fichier supprimé' });
      } else {
        sendJson(res, 404, { error: 'Fichier non trouvé' });
      }
    });
  }
  
  else if (method === 'POST' && pathname === '/compress') {
    requireAuth(req, res, (userId) => {
      fileManager.compressUserFiles(userId, (error, result) => {
        if (error) {
          return sendJson(res, 500, { error });
        }
        
        notifyClients({
          type: 'compression_completed',
          userId,
          filename: result.filename
        });
        
        sendJson(res, 200, { 
          message: 'Compression terminée',
          filename: result.filename 
        });
      });
    });
  }
  
  else if (method === 'POST' && pathname === '/analyze') {
    requireAuth(req, res, (userId) => {
      parseJsonBody(req, (error, data) => {
        if (error || !data.filename) {
          return sendJson(res, 400, { error: 'Filename requis' });
        }
        
        fileManager.analyzeFile(userId, data.filename, (error, result) => {
          if (error) {
            return sendJson(res, 500, { error });
          }
          
          sendJson(res, 200, { analysis: result });
        });
      });
    });
  }
  
  else if (method === 'POST' && pathname === '/share') {
    requireAuth(req, res, (userId) => {
      parseJsonBody(req, (error, data) => {
        if (error || !data.filename) {
          return sendJson(res, 400, { error: 'Filename requis' });
        }
        
        const success = fileManager.shareFile(userId, data.filename);
        
        if (success) {
          notifyClients({
            type: 'file_shared',
            userId,
            filename: data.filename
          });
          
          sendJson(res, 200, { message: 'Fichier partagé' });
        } else {
          sendJson(res, 500, { error: 'Erreur partage' });
        }
      });
    });
  }
  
  else if (method === 'GET' && pathname === '/shared') {
    requireAuth(req, res, (userId) => {
      const files = fileManager.listSharedFiles();
      sendJson(res, 200, { files });
    });
  }
  
  else {
    res.writeHead(200, { 
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(`Gestionnaire de fichiers API
    
Routes disponibles:
POST /login - Connexion
POST /logout - Déconnexion
GET /files - Lister mes fichiers
POST /upload - Upload fichier
GET /download/:filename - Télécharger
DELETE /files/:filename - Supprimer
POST /compress - Compresser mes fichiers
POST /analyze - Analyser un fichier
POST /share - Partager un fichier
GET /shared - Lister fichiers partagés`);
  }
});

server.listen(3000, () => {
  console.log('Serveur démarré sur http://localhost:3000');
});

module.exports = server;