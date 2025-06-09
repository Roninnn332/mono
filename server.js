const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected clients per channel
const channels = new Map();

// Debug logging for WebSocket server
console.log('WebSocket server initialized');

wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    ws.userId = null;
    ws.channelId = null;

    ws.on('message', (message) => {
        console.log('Received message:', message.toString());
        try {
            const data = JSON.parse(message);
            console.log('Parsed message data:', data);

            if (data.type === 'join') {
                ws.userId = data.userId || data.id;
                ws.channelId = data.room; // room = channelId
                // Remove from all channels first
                for (const [cid, set] of channels.entries()) {
                    set.delete(ws);
                }
                if (!channels.has(ws.channelId)) channels.set(ws.channelId, new Set());
                channels.get(ws.channelId).add(ws);
                // Send initial state to new client
                sendUserList(ws.channelId);
            }
            if (data.type === 'leave') {
                if (ws.channelId && channels.has(ws.channelId)) {
                    channels.get(ws.channelId).delete(ws);
                    sendUserList(ws.channelId);
                    ws.channelId = null;
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        if (ws.channelId && channels.has(ws.channelId)) {
            channels.get(ws.channelId).delete(ws);
            sendUserList(ws.channelId);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    function sendUserList(channelId) {
        const channelClients = channels.get(channelId) || new Set();
        const userList = Array.from(channelClients).map(client => client.userId).filter(Boolean);
        channelClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'user_list_update',
                    users: userList,
                    room: channelId
                }));
            }
        });
    }
});

// Serve static files from the root directory
app.use(express.static(__dirname));

// Fallback route for SPA: serve index.html for all unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 