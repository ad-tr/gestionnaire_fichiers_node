const WebSocket = require('ws');
const { getUserIdFromToken } = require('./auth');

const wss = new WebSocket.Server({ port: 8081 });
const clients = new Map();

wss.on('connection', (ws, req) => {
  console.log('Nouvelle connexion WebSocket');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'auth' && data.token) {
        const userId = getUserIdFromToken(data.token);
        
        if (userId) {
          clients.set(data.token, {
            ws: ws,
            userId: userId,
            connected: Date.now()
          });
          
          ws.send(JSON.stringify({
            type: 'auth_success',
            message: `Connexion WebSocket authentifiée pour ${userId}`,
            userId: userId
          }));
          
          console.log(`Client ${userId} authentifié via WebSocket`);
        } else {
          ws.send(JSON.stringify({
            type: 'auth_error',
            message: 'Token invalide'
          }));
          
          console.log('Tentative d\'authentification WebSocket échouée');
        }
      } else if (data.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Erreur parsing message WebSocket:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Message invalide'
      }));
    }
  });
  
  ws.on('close', () => {
    for (const [token, client] of clients.entries()) {
      if (client.ws === ws) {
        console.log(`Client ${client.userId} déconnecté`);
        clients.delete(token);
        break;
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('Erreur WebSocket:', error);
  });
  
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connexion WebSocket établie. Envoyez votre token pour authentification.',
    instructions: {
      auth: 'Envoyez: {"type": "auth", "token": "votre_token"}',
      ping: 'Envoyez: {"type": "ping"} pour tester la connexion'
    }
  }));
});

function notifyClients(notification) {
  const message = JSON.stringify({
    type: 'notification',
    timestamp: Date.now(),
    ...notification
  });
  
  let sentCount = 0;
  
  clients.forEach((client, token) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(message);
        sentCount++;
      } catch (error) {
        console.error(`Erreur envoi notification à ${client.userId}:`, error);
        clients.delete(token);
      }
    } else {
      clients.delete(token);
    }
  });
  
  console.log(`📢 Notification envoyée à ${sentCount} clients:`, notification.type);
}

function notifyUser(userId, notification) {
  const message = JSON.stringify({
    type: 'notification',
    timestamp: Date.now(),
    ...notification
  });
  
  let sent = false;
  
  clients.forEach((client, token) => {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(message);
        sent = true;
      } catch (error) {
        console.error(`Erreur envoi notification à ${userId}:`, error);
        clients.delete(token);
      }
    }
  });
  
  if (sent) {
    console.log(`📢 Notification envoyée à ${userId}:`, notification.type);
  }
}

function getStats() {
  const activeClients = Array.from(clients.values()).filter(
    client => client.ws.readyState === WebSocket.OPEN
  );
  
  return {
    totalConnections: clients.size,
    activeConnections: activeClients.length,
    users: activeClients.map(client => ({
      userId: client.userId,
      connectedSince: new Date(client.connected).toISOString()
    }))
  };
}

setInterval(() => {
  clients.forEach((client, token) => {
    if (client.ws.readyState !== WebSocket.OPEN) {
      clients.delete(token);
    }
  });
}, 30000);

console.log('Serveur WebSocket démarré sur ws://localhost:8081');
console.log('En attente de connexions...');

module.exports = {
  wss,
  notifyClients,
  notifyUser,
  getStats
};