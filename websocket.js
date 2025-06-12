// WebSocket de base avec ws
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8081 });

wss.on('connection', ws => {
  console.log('Client WebSocket connecté');
  ws.send(JSON.stringify({ message: 'Connexion réussie' }));
});
