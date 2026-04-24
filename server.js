const express = require("express");
const http = require("http");
const fs = require("fs");
const socketio = require("socket.io");

const app = express();

// RENDER FIX: Serve static files before anything else to prevent CSS 503 errors
app.use(express.static("public"));

const server = http.createServer(app);

// SOCKET FIX: Explicit transports for Render stability
const io = socketio(server, {
    cors: { origin: "*" },
    transports: ["polling", "websocket"] 
});

const PORT = process.env.PORT || 3000;
const USERS_FILE = "./users.json";

let users = {};
let players = {};
let projectiles = [];

// ===================== FILE STORAGE =====================
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, "utf8");
            users = data ? JSON.parse(data) : {};
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
        console.error("Save error:", err);
    }
}

loadUsers();

// ===================== PORTALS =====================
const PORTALS = [
    { fromRoom: "hub", toRoom: "gym", x: 100, y: 1000, targetX: 1800, targetY: 1000, color: "#e67e22", label: "GYM" },
    { fromRoom: "hub", toRoom: "lake", x: 1900, y: 1000, targetX: 200, targetY: 1000, color: "#3498db", label: "LAKE" },
    { fromRoom: "hub", toRoom: "shrine", x: 1000, y: 100, targetX: 1000, targetY: 1800, color: "#2ecc71", label: "SHRINE" }
];

// ===================== PLAYER TEMPLATE =====================
function createPlayer(id, name, u) {
    return {
        id,
        name,
        charClass: u.charClass,
        x: 1000,
        y: 1000,
        room: "hub",
        hp: 100,
        maxHp: 100,
        mana: 100,
        maxMana: 100,
        gold: u.gold || 0,
        str: u.str,
        def: u.def,
        spd: u.spd,
        level: u.level || 1,
        xp: u.xp || 0,
        prestige: u.prestige || 0,
        skillPoints: u.skillPoints,
        upgrades: u.upgrades,
        gear: u.gear,
        buffs: { str: 1 },
        cooldowns: { Q: 0, E: 0 },
        keys: {}
    };
}

// ===================== SOCKET LOGIC =====================
io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    // ---------------- REGISTER ----------------
    socket.on("register", (data) => {
        if (!data) return;
        const name = (data.name || "").trim();
        const pass = data.password;

        if (!name || !pass) {
            socket.emit("authError", "Missing fields");
            return;
        }

        if (users[name]) {
            socket.emit("authError", "User already exists");
            return;
        }

        users[name] = {
            password: pass,
            charClass: data.charClass || "Warrior",
            str: 10, def: 5, spd: 4,
            gold: 0, level: 1, xp: 0, prestige: 0,
            skillPoints: 1,
            upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
            gear: { sword: 0, armor: 0, boots: 0 }
        };

        saveUsers();
        socket.emit("authMessage", "Registered successfully");
    });

    // ---------------- LOGIN ----------------
    socket.on("login", (data) => {
        if (!data) return;
        const name = (data.name || "").trim();
        const pass = data.password;
        const u = users[name];

        if (!u || u.password !== pass) {
            socket.emit("authError", "Invalid login");
            return;
        }

        players[socket.id] = createPlayer(socket.id, name, u);
        socket.emit("init", {
            id: socket.id,
            portals: PORTALS,
            self: players[socket.id]
        });
    });

    // ---------------- MOVE ----------------
    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p || !data) return;
        p.keys = data.keys || {};

        if (p.keys.w) p.y -= p.spd;
        if (p.keys.s) p.y += p.spd;
        if (p.keys.a) p.x -= p.spd;
        if (p.keys.d) p.x += p.spd;

        // Boundary Check
        p.x = Math.max(0, Math.min(p.x, 2000));
        p.y = Math.max(0, Math.min(p.y, 2000));

        // Portal Collision
        for (const pt of PORTALS) {
            if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
            }
        }
    });

    // ---------------- ATTACK (CLICK TO ATTACK) ----------------
    socket.on("attack", (clickData) => {
        const p = players[socket.id];
        if (!p || p.room === "hub" || Date.now() - (p.latk || 0) < 300) return;
        p.latk = Date.now();

        // Direction based on click coordinates relative to player world position
        const angle = Math.atan2(clickData.y - p.y, clickData.x - p.x);

        projectiles.push({
            id: Math.random(),
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * 15,
            vy: Math.sin(angle) * 15,
            owner: socket.id,
            room: p.room,
            damage: p.str * p.buffs.str
        });
    });

    // ---------------- DISCONNECT ----------------
    socket.on("disconnect", () => {
        const p = players[socket.id];
        if (p) {
            // Save current progress back to users object before deleting
            users[p.name].gold = p.gold;
            users[p.name].str = p.str;
            users[p.name].def = p.def;
            users[p.name].spd = p.spd;
            users[p.name].upgrades = p.upgrades;
            saveUsers();
            delete players[socket.id];
        }
    });
});

// ===================== GAME LOOP =====================
setInterval(() => {
    // Update Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.x += pr.vx;
        pr.y += pr.vy;

        // Range limit or boundary check
        if (pr.x < 0 || pr.x > 2000 || pr.y < 0 || pr.y > 2000) {
            projectiles.splice(i, 1);
        }
    }

    io.emit("update", { players, projectiles });
}, 1000 / 30);

// ===================== START SERVER =====================
server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port", PORT);
});
