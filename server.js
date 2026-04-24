const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

// ===================== CONFIG =====================
const WORLD_SIZE = 2000;
const TICK_RATE = 1000 / 30;

const PORTALS = [
    { fromRoom: "hub", toRoom: "gym", x: 100, y: 1000, targetX: 1800, targetY: 1000, color: "#e67e22", label: "GYM" },
    { fromRoom: "hub", toRoom: "lake", x: 1900, y: 1000, targetX: 200, targetY: 1000, color: "#3498db", label: "LAKE" },
    { fromRoom: "hub", toRoom: "shrine", x: 1000, y: 100, targetX: 1000, targetY: 1800, color: "#2ecc71", label: "SHRINE" },
    { fromRoom: "hub", toRoom: "shop", x: 1000, y: 1900, targetX: 1000, targetY: 200, color: "#f1c40f", label: "SHOP" },
    { fromRoom: "hub", toRoom: "graveyard", x: 1800, y: 200, targetX: 200, targetY: 200, color: "#555", label: "GRAVEYARD" }
];

// ===================== STATE =====================
let users = {};
let players = {};
let monsters = [];
let projectiles = [];

// ===================== HELPERS =====================
function createBasePlayer(socketId, name, classType, u) {
    return {
        id: socketId,
        name,
        charClass: classType,

        x: 1000,
        y: 1000,
        room: "hub",

        hp: 100,
        maxHp: 100,
        mana: 100,
        maxMana: 100,

        gold: u.gold || 0,

        str: u.str || 10,
        def: u.def || 5,
        spd: u.spd || 4,

        level: u.level || 1,
        xp: u.xp || 0,
        prestige: u.prestige || 0,

        skillPoints: u.skillPoints || 1,
        upgrades: u.upgrades || { start: 0, ult: 0, branchA: 0, branchB: 0 },
        gear: u.gear || { sword: 0, armor: 0, boots: 0 },

        buffs: { str: 1 },
        cooldowns: {},
        keys: {}
    };
}

function giveXP(p, amount) {
    p.xp += amount;

    const needed = 100 + p.level * 25;

    if (p.xp >= needed) {
        p.xp -= needed;
        p.level += 1;
        p.skillPoints += 1;
        p.maxHp += 10;
        p.hp = p.maxHp;
    }
}

// ===================== SOCKET =====================
io.on("connection", (socket) => {

    console.log("CONNECTED:", socket.id);

    // -------- REGISTER --------
    socket.on("register", (data) => {
        console.log("REGISTER:", data);

        if (!data?.name || !data?.password) {
            socket.emit("authError", "Missing fields");
            return;
        }

        if (users[data.name]) {
            socket.emit("authError", "User already exists");
            return;
        }

        users[data.name] = {
            password: data.password,
            charClass: data.charClass || "Warrior",
            str: 10,
            def: 5,
            spd: 4,
            gold: 0,
            skillPoints: 1,
            level: 1,
            xp: 0,
            prestige: 0,
            upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
            gear: { sword: 0, armor: 0, boots: 0 }
        };

        socket.emit("authMessage", "Registered successfully!");
    });

    // -------- LOGIN --------
    socket.on("login", (data) => {
        console.log("LOGIN:", data);

        const u = users[data.name];

        if (!u) {
            socket.emit("authError", "User not found");
            return;
        }

        if (u.password !== data.password) {
            socket.emit("authError", "Wrong password");
            return;
        }

        const player = createBasePlayer(socket.id, data.name, u.charClass, u);

        players[socket.id] = player;

        console.log("LOGIN SUCCESS:", data.name);

        socket.emit("init", {
            id: socket.id,
            portals,
            self: player
        });
    });

    // -------- MOVE --------
    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        const keys = data.keys;

        if (keys.w) p.y -= p.spd;
        if (keys.s) p.y += p.spd;
        if (keys.a) p.x -= p.spd;
        if (keys.d) p.x += p.spd;

        p.x = Math.max(0, Math.min(WORLD_SIZE, p.x));
        p.y = Math.max(0, Math.min(WORLD_SIZE, p.y));

        // portals
        for (const pt of PORTALS) {
            if (p.room === pt.fromRoom &&
                Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
            }
        }
    });

    // -------- ATTACK --------
    socket.on("attack", (data) => {
        const p = players[socket.id];
        if (!p) return;

        const angle = Math.atan2(data.y - p.y, data.x - p.x);

        projectiles.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * 18,
            vy: Math.sin(angle) * 18,
            room: p.room,
            owner: socket.id,
            damage: p.str
        });
    });

    // -------- DISCONNECT --------
    socket.on("disconnect", () => {
        console.log("DISCONNECT:", socket.id);
        delete players[socket.id];
    });
});

// ===================== GAME LOOP =====================
setInterval(() => {

    for (const p of Object.values(players)) {
        p.mana = Math.min(p.maxMana, p.mana + 0.5);
    }

    // projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.x += pr.vx;
        pr.y += pr.vy;

        if (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE) {
            projectiles.splice(i, 1);
        }
    }

    io.emit("update", {
        players,
        monsters,
        projectiles
    });

}, TICK_RATE);

// ===================== START =====================
http.listen(3000, () => {
    console.log("Server running on port 3000");
});
