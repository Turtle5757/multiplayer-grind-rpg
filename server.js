const express = require("express");
const fs = require("fs");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

const USERS_FILE = "./users.json";

// ===================== LOAD USERS =====================
let users = {};

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
        } else {
            users = {};
            fs.writeFileSync(USERS_FILE, "{}");
        }
    } catch (err) {
        console.log("Error loading users:", err);
        users = {};
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

loadUsers();

// ===================== GAME STATE =====================
let players = {};
let projectiles = [];

const PORTALS = [
    { fromRoom: "hub", toRoom: "gym", x: 100, y: 1000, targetX: 1800, targetY: 1000, color: "#e67e22", label: "GYM" },
    { fromRoom: "hub", toRoom: "lake", x: 1900, y: 1000, targetX: 200, targetY: 1000, color: "#3498db", label: "LAKE" },
    { fromRoom: "hub", toRoom: "shrine", x: 1000, y: 100, targetX: 1000, targetY: 1800, color: "#2ecc71", label: "SHRINE" }
];

// ===================== PLAYER CREATION =====================
function createPlayer(socketId, name, u) {
    return {
        id: socketId,
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
        cooldowns: {},
        keys: {}
    };
}

// ===================== SOCKET =====================
io.on("connection", (socket) => {

    console.log("CONNECTED:", socket.id);

    // ---------------- REGISTER ----------------
    socket.on("register", (data) => {
        console.log("REGISTER:", data);

        const name = (data.name || "").trim();

        if (!name || !data.password) {
            socket.emit("authError", "Missing fields");
            return;
        }

        if (users[name]) {
            socket.emit("authError", "User already exists");
            return;
        }

        users[name] = {
            password: data.password,
            charClass: data.charClass || "Warrior",

            str: 10,
            def: 5,
            spd: 4,

            gold: 0,
            level: 1,
            xp: 0,
            prestige: 0,

            skillPoints: 1,
            upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
            gear: { sword: 0, armor: 0, boots: 0 }
        };

        saveUsers();

        socket.emit("authMessage", "Registered & Saved!");
    });

    // ---------------- LOGIN ----------------
    socket.on("login", (data) => {
        console.log("LOGIN:", data);

        const name = (data.name || "").trim();
        const pass = data.password || "";

        const u = users[name];

        if (!u) {
            socket.emit("authError", "User not found");
            return;
        }

        if (u.password !== pass) {
            socket.emit("authError", "Wrong password");
            return;
        }

        players[socket.id] = createPlayer(socket.id, name, u);

        socket.emit("init", {
            id: socket.id,
            portals,
            self: players[socket.id]
        });

        console.log("LOGIN SUCCESS:", name);
    });

    // ---------------- MOVE ----------------
    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        const k = data.keys;

        if (k.w) p.y -= p.spd;
        if (k.s) p.y += p.spd;
        if (k.a) p.x -= p.spd;
        if (k.d) p.x += p.spd;

        for (const pt of PORTALS) {
            if (p.room === pt.fromRoom &&
                Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
            }
        }
    });

    // ---------------- DISCONNECT ----------------
    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

// ===================== GAME LOOP =====================
setInterval(() => {

    io.emit("update", {
        players,
        projectiles
    });

}, 1000 / 30);

// ===================== START =====================
http.listen(3000, () => {
    console.log("Server running on port 3000");
});
