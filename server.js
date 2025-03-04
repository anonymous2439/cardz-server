const { WebSocketServer } = require("ws");

// Create WebSocket server
const wss = new WebSocketServer({ port: 8081 });

// Store rooms with players
const rooms = new Map(); // { roomId: Set(sockets) }

// Broadcast player count for a specific room
const broadcastPlayerCount = (roomId) => {
    if (!rooms.has(roomId)) return;

    const playerCount = rooms.get(roomId).size;
    rooms.get(roomId).forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({ type: "updatePlayerCount", data: playerCount }));
        }
    });
};

wss.on("connection", (ws) => {
    console.log("Client connected");
    ws.isAlive = true; // Mark client as alive
    let roomId = null; // Store the room the player joins

    ws.on("message", (message) => {
        const data = JSON.parse(message.toString());

        if (data.type === "join_room") {
            // Assign the player to a room
            roomId = data.roomId;

            if (!rooms.has(roomId)) {
                rooms.set(roomId, new Set());
            }
            rooms.get(roomId).add(ws);

            console.log(`Client joined room: ${roomId}`);
            broadcastPlayerCount(roomId);
            return;
        }

        // old way
        // wss.clients.forEach(client => {
        //     if (client !== ws && client.readyState === client.OPEN) {
        //         client.send(JSON.stringify({ type: "updatePlayers", data: JSON.parse(message.toString()) }));
        //     }
        // });


        if (roomId && data.type === "updatePlayers") {
            // Broadcast only within the room
            rooms.get(roomId).forEach(client => {
                if (client !== ws && client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ type: "updatePlayers", data }));
                }
            });
        }
    });

    ws.on("pong", () => {
        ws.isAlive = true; // Client responded to ping
    });

    ws.on("close", () => {
        console.log("Client disconnected");

        if (roomId && rooms.has(roomId)) {
            rooms.get(roomId).delete(ws);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId); // Remove empty room
            }
            setTimeout(() => broadcastPlayerCount(roomId), 100);
        }
    });
});

// Ping clients every 30 seconds
setInterval(() => {
    wss.clients.forEach(ws => {
        ws.isAlive = false;
        ws.ping(); // Send ping
    });
}, 30000);

console.log("WebSocket server is running");
