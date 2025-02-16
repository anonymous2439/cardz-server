const { WebSocketServer } = require("ws");

// Create WebSocket server
const wss = new WebSocketServer({ port: 8081 });

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
    broadcastPlayerCount();

    ws.on("message", (message) => {
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === client.OPEN) {
                client.send(JSON.stringify({ type: "updatePlayers", data: JSON.parse(message.toString()) }));
            }
        });
    });

    ws.on("close", () => {
        console.log("Client disconnected");
        if (wss.clients.size > 0)
            setTimeout(() => broadcastPlayerCount(), 100);
    });
});

console.log("WebSocket server is running");
