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

// ===================== STATE =====================
let users = {};
let players = {};
let projectiles = [];

// ===================== MONSTER ZONE =====================
let monsters = [
    { id: 1, x: 600, y: 600, hp: 120, maxHp: 120, room: "graveyard", xp: 25, gold: 10, alive: true, spd: 1.3 },
    { id: 2, x: 900, y: 900, hp: 180, maxHp: 180, room: "graveyard", xp: 40, gold: 15, alive: true, spd: 1.1 },
    { id: 3, x: 1200, y: 1200, hp: 500, maxHp: 500, room: "graveyard", xp: 120, gold: 50, alive: true, spd: 1.6 }
];

// ===================== LOAD / SAVE =====================
function loadUsers() {
    try {
        users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8") || "{}");
    } catch {
        users = {};
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

loadUsers();

// ===================== PORTALS =====================
const PORTALS = [
    // HUB → ROOMS
    { fromRoom: "hub", toRoom: "graveyard", x: 500, y: 500, tx: 1500, ty: 1500, color: "#8e44ad", label: "GRAVEYARD" },
    { fromRoom: "graveyard", toRoom: "hub", x: 1500, y: 1500, tx: 500, ty: 500, color: "#ffffff", label: "EXIT" },

    { fromRoom: "hub", toRoom: "gym", x: 100, y: 1000, tx: 1800, ty: 1000, color: "#e67e22", label: "GYM" },
    { fromRoom: "gym", toRoom: "hub", x: 1900, y: 1000, tx: 200, ty: 1000, color: "#ffffff", label: "EXIT" },

    { fromRoom: "hub", toRoom: "lake", x: 1900, y: 1000, tx: 200, ty: 1000, color: "#3498db", label: "LAKE" },
    { fromRoom: "lake", toRoom: "hub", x: 100, y: 1000, tx: 1800, ty: 1000, color: "#ffffff", label: "EXIT" }
];

// ===================== PLAYER =====================
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
        xpToNext: 100,

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

    console.log("Connected:", socket.id);

    // -------- REGISTER --------
    socket.on("register", (data) => {
        const name = (data.name || "").trim();
        if (!name || !data.password) return;

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
            skillPoints: 1,
            upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
            gear: { sword: 0, armor: 0, boots: 0 }
        };

        saveUsers();
        socket.emit("authMessage", "Registered");
    });

    // -------- LOGIN --------
    socket.on("login", (data) => {
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
            portals: PORTALS
        });
    });

    // -------- MOVE --------
    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        const k = data.keys || {};

        if (k.w) p.y -= p.spd;
        if (k.s) p.y += p.spd;
        if (k.a) p.x -= p.spd;
        if (k.d) p.x += p.spd;

        for (const pt of PORTALS) {
            if (p.room === pt.fromRoom) {
                const dx = p.x - pt.x;
                const dy = p.y - pt.y;

                if (Math.sqrt(dx * dx + dy * dy) < 60) {
                    p.room = pt.toRoom;
                    p.x = pt.tx;
                    p.y = pt.ty;
                }
            }
        }
    });

    // -------- ATTACK (PvP + PvE) --------
    socket.on("attack", (d) => {
        const p = players[socket.id];
        if (!p) return;

        const angle = Math.atan2(d.y - p.y, d.x - p.x);

        projectiles.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * 14,
            vy: Math.sin(angle) * 14,
            owner: socket.id,
            room: p.room,
            damage: p.str
        });
    });

    // -------- ABILITIES --------
    socket.on("useAbility", (data) => {
        const p = players[socket.id];
        if (!p) return;

        const now = Date.now();
        if (!p.cooldowns[data.key]) p.cooldowns[data.key] = 0;
        if (now < p.cooldowns[data.key]) return;

        const dx = data.targetX - p.x;
        const dy = data.targetY - p.y;
        const angle = Math.atan2(dy, dx);

        let dmg = p.str;

        if (data.skillId === "start") dmg *= 1.5;
        if (data.skillId === "ult") dmg *= 3;

        projectiles.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * 16,
            vy: Math.sin(angle) * 16,
            owner: socket.id,
            room: p.room,
            damage: dmg,
            isAbility: true
        });

        p.cooldowns[data.key] = now + (data.skillId === "ult" ? 2500 : 800);
    });

    // -------- DISCONNECT --------
    socket.on("disconnect", () => {
        const p = players[socket.id];
        if (p) {
            users[p.name] = {
                ...users[p.name],
                gold: p.gold,
                xp: p.xp,
                level: p.level
            };
            saveUsers();
        }
        delete players[socket.id];
    });
});

// ===================== GAME LOOP =====================
setInterval(() => {

    // -------- MONSTERS --------
    monsters.forEach(m => {
        if (!m.alive) return;

        Object.values(players).forEach(p => {
            if (p.room !== m.room) return;

            const dist = Math.hypot(p.x - m.x, p.y - m.y);

            if (dist < 400) {
                const a = Math.atan2(p.y - m.y, p.x - m.x);
                m.x += Math.cos(a) * m.spd;
                m.y += Math.sin(a) * m.spd;

                if (dist < 40) {
                    p.hp -= 5;
                    if (p.hp <= 0) {
                        p.x = 1000;
                        p.y = 1000;
                        p.hp = p.maxHp;
                    }
                }
            }
        });
    });

    // -------- PROJECTILES --------
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];

        pr.x += pr.vx;
        pr.y += pr.vy;

        // MONSTERS HIT
        monsters.forEach(m => {
            if (!m.alive || m.room !== pr.room) return;

            if (Math.hypot(pr.x - m.x, pr.y - m.y) < 30) {
                m.hp -= pr.damage;
                projectiles.splice(i, 1);

                if (m.hp <= 0) {
                    m.alive = true;
                    m.hp = m.maxHp;

                    const owner = players[pr.owner];
                    if (owner) {
                        owner.gold += m.gold;
                        owner.xp += m.xp;

                        if (owner.xp >= owner.xpToNext) {
                            owner.level++;
                            owner.xp = 0;
                            owner.xpToNext = Math.floor(owner.xpToNext * 1.2);
                            owner.skillPoints++;
                        }
                    }
                }
            }
        });

        // REMOVE OUT OF BOUNDS
        if (pr.x < 0 || pr.y < 0 || pr.x > 2000 || pr.y > 2000) {
            projectiles.splice(i, 1);
        }
    }

    io.emit("update", {
        players,
        monsters,
        projectiles,
        portals: PORTALS
    });

}, 1000 / 30);

// ===================== START =====================
server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on", PORT);
});
