const { WebSocketServer } = require("ws");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2");
const app = express();
const SECRET_KEY = "mysuperdupersecretkey"

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



/**
 * Middleware
 */

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(403).json({ success: false, message: "No token provided" });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ success: false, message: "Invalid token" });

        req.user = decoded; // Attach user info to request
        next();
    });
};



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
        return res.status(200).json({ success: false, message: "Username and password are required" });
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
                return res.status(200).json({ success: false, message: "Database error" });
            }
            res.status(201).json({ success: true, message: "User registered successfully!" });
        });

    } catch (error) {
        console.error("Error hashing password:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});


app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    try {
        // 🔍 Check if the user exists
        const sql = "SELECT * FROM users WHERE username = ?";
        db.query(sql, [username], async (err, results) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ success: false, message: "Database error" });
            }

            if (results.length === 0) {
                return res.status(200).json({ success: false, message: "Invalid username or password" });
            }

            // 🛡️ Compare the hashed password
            const user = results[0];
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.status(200).json({ success: false, message: "Invalid username or password" });
            }

            // Generate JWT token
            const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: "1h" });

            const resData = {
                token, 
                user: { id: user.id, username: user.username },
            }

            // ✅ Login successful
            res.status(200).json({ success: true, message: "Login successful!", data: resData });
        });

    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});



// Start server
const PORT = 8082;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});



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
