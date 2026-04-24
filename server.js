const express = require("express");
const http = require("http");
const fs = require("fs");
const socketio = require("socket.io");

const app = express();
app.use(express.static("public"));

const server = http.createServer(app);

const io = socketio(server, {
    cors: { origin: "*" },
    transports: ["polling", "websocket"]
});

const PORT = process.env.PORT || 3000;
const USERS_FILE = "./users.json";

// ===================== SAFE STORAGE =====================
let users = {};
let players = {};
let projectiles = [];

// ===================== LOAD USERS =====================
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE));
        } else {
            users = {};
            fs.writeFileSync(USERS_FILE, "{}");
        }
    } catch (err) {
        console.log("User load error:", err);
        users = {};
    }
}

function saveUsers() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.log("Save error:", err);
    }
}

loadUsers();

// ===================== WORLD =====================
const WORLD_SIZE = 2000;
const PLAYER_SPEED = 8;
const ACCELERATION = 0.8;
const FRICTION = 0.85;

// 🔥 FIX: THIS WAS YOUR CRASH
const PORTALS = [
    { fromRoom: "hub", toRoom: "graveyard", x: 1800, y: 1000, targetX: 300, targetY: 1000, color: "#555", label: "GRAVEYARD" },
    { fromRoom: "graveyard", toRoom: "hub", x: 100, y: 1000, targetX: 1700, targetY: 1000, color: "#fff", label: "EXIT" }
];

// ===================== PLAYER =====================
function createPlayer(id, name, u) {
    return {
        id,
        name,
        charClass: u.charClass,

        x: 1000,
        y: 1000,
        vx: 0,  // velocity X
        vy: 0,  // velocity Y
        room: "hub",

        hp: 100,
        maxHp: 100,
        mana: 100,
        maxMana: 100,

        gold: u.gold || 0,

        str: u.str,
        def: u.def,
        spd: u.spd,

        skillPoints: u.skillPoints || 0,
        upgrades: u.upgrades || { start: 0, ult: 0, branchA: 0, branchB: 0 },

        buffs: { str: 1 },
        keys: {}
    };
}

// ===================== SOCKET =====================
io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    // -------- REGISTER --------
    socket.on("register", (data) => {
        const name = data?.name;

        if (!name || users[name]) {
            socket.emit("authError", "Invalid or already exists");
            return;
        }

        users[name] = {
            password: data.password,
            charClass: data.charClass || "Warrior",
            str: 10,
            def: 5,
            spd: 4,
            gold: 0,
            skillPoints: 1,
            upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 }
        };

        saveUsers();
        socket.emit("authMessage", "Registered!");
    });

    // -------- LOGIN --------
    socket.on("login", (data) => {
        const u = users[data?.name];

        if (!u || u.password !== data.password) {
            socket.emit("authError", "Login failed");
            return;
        }

        players[socket.id] = createPlayer(socket.id, data.name, u);

        socket.emit("init", {
            id: socket.id,
            portals: PORTALS   // 🔥 FIXED HERE (NO MORE CRASH)
        });
    });

    // -------- MOVE --------
    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.keys = data.keys || {};
    });

    // -------- ATTACK --------
    socket.on("attack", (data) => {
        const p = players[socket.id];
        if (!p) return;

        const angle = Math.atan2(data.y - p.y, data.x - p.x);

        projectiles.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * 15,
            vy: Math.sin(angle) * 15,
            room: p.room,
            owner: socket.id,
            damage: p.str
        });
    });

    // -------- DISCONNECT --------
    socket.on("disconnect", () => {
        const p = players[socket.id];

        if (p) {
            users[p.name].gold = p.gold;
            saveUsers();
        }

        delete players[socket.id];
    });
});

// ===================== GAME UPDATE LOOP =====================
setInterval(() => {
    // Update player movement with smooth physics
    Object.values(players).forEach(p => {
        // Apply acceleration based on keys pressed
        const baseSpeed = PLAYER_SPEED + (p.spd * 0.5);
        
        if (p.keys.w) p.vy -= ACCELERATION;
        if (p.keys.s) p.vy += ACCELERATION;
        if (p.keys.a) p.vx -= ACCELERATION;
        if (p.keys.d) p.vx += ACCELERATION;

        // Apply max speed cap
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > baseSpeed) {
            const ratio = baseSpeed / speed;
            p.vx *= ratio;
            p.vy *= ratio;
        }

        // Apply friction
        p.vx *= FRICTION;
        p.vy *= FRICTION;

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Clamp to world boundaries
        p.x = Math.max(0, Math.min(WORLD_SIZE, p.x));
        p.y = Math.max(0, Math.min(WORLD_SIZE, p.y));

        // Portal collision
        for (const pt of PORTALS) {
            if (p.room === pt.fromRoom &&
                Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {

                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
                p.vx = 0;
                p.vy = 0;
            }
        }
    });

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];

        pr.x += pr.vx;
        pr.y += pr.vy;

        if (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE) {
            projectiles.splice(i, 1);
        }
    }

    // Broadcast state
    io.emit("update", {
        players,
        projectiles
    });
}, 1000 / 60);  // Increased to 60 FPS for smoother updates

// ===================== START =====================
server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on", PORT);
});
