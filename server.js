const { WebSocketServer } = require("ws");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2");
const app = express();

/**
 * Initialize database
 */

const live = {
    host: "localhost",
    user: "rev",
    password: "2439",
    database: "cardz",
    waitForConnections: true,
    connectionLimit: 100,  // Allow up to 100 concurrent connections
    queueLimit: 0
}

const db = mysql.createPool(live);



/**
 * Initialize express
 */

app.use(cors({
    origin: ["http://localhost:3000", "http://localhost:8081", "https://cardz-client.netlify.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Middleware to parse JSON requests
app.use(express.json());

// Test route
app.get("/", (req, res) => {
    console.log('req:',req.query)
    res.json({ message: "Hello", status: "success" });
});

app.post("/signup", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    try {
        // 🔐 Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 🛢️ Save to MySQL
        const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
        db.query(sql, [username, hashedPassword], (err, result) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ success: false, message: "Database error" });
            }
            res.status(201).json({ success: true, message: "User registered successfully!" });
        });

    } catch (error) {
        console.error("Error hashing password:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});


// Start server
const PORT = 8082;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


// test database
// const sql = "SELECT * FROM users;";
// db.query(sql, (err, result) => {
//     if (err) {
//         console.error("Error getting messages from database:", err);
//     } else {
//         result.forEach(res => {
//             let response = JSON.stringify(res);
//             console.log("response:",response)
//         });
//     }
// });



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
