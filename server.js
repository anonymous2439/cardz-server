const { WebSocketServer } = require("ws");

// Create WebSocket server
const wss = new WebSocketServer({ port: 8081 });

// Broadcast player count
const broadcastPlayerCount = () => {
    const playerCount = wss.clients.size;
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({ type: "updatePlayerCount", data: playerCount }));
        }
    });
};

wss.on("connection", (ws) => {
    console.log("Client connected");
    ws.isAlive = true; // Mark client as alive
    broadcastPlayerCount();

    ws.on("message", (message) => {
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === client.OPEN) {
                client.send(JSON.stringify({ type: "updatePlayers", data: JSON.parse(message.toString()) }));
            }
        });
    });

    ws.on("pong", () => {
        ws.isAlive = true; // Client responded to ping
    });

    ws.on("close", () => {
        console.log("Client disconnected");
        if (wss.clients.size > 0)
            setTimeout(() => broadcastPlayerCount(), 100);
    });
});

// Ping clients every 30 seconds
setInterval(() => {
    wss.clients.forEach(ws => {
        // if (!ws.isAlive) {
        //     console.log("Terminating inactive client");
        //     return ws.terminate();
        // }

        ws.isAlive = false;
        ws.ping(); // Send ping
    });
}, 30000); // Check every 30 seconds

console.log("WebSocket server is running");
