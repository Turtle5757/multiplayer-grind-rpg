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

// ===================== DATA =====================
let users = {};
let players = {};
let projectiles = [];

let monsters = [
    { id: 1, x: 500, y: 500, hp: 120, maxHp: 120, room: "gym", xp: 25, gold: 10, alive: true, spd: 1.5 },
    { id: 2, x: 1500, y: 600, hp: 200, maxHp: 200, room: "lake", xp: 40, gold: 15, alive: true, spd: 1.2 },
    { id: 3, x: 1000, y: 1500, hp: 500, maxHp: 500, room: "shrine", xp: 120, gold: 50, alive: true, spd: 2.0 }
];

// ===================== LOAD/SAVE =====================
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
    { fromRoom: "hub", toRoom: "gym", x: 100, y: 1000, targetX: 1800, targetY: 1000, color: "#e67e22", label: "GYM" },
    { fromRoom: "hub", toRoom: "lake", x: 1900, y: 1000, targetX: 200, targetY: 1000, color: "#3498db", label: "LAKE" },
    { fromRoom: "hub", toRoom: "shrine", x: 1000, y: 100, targetX: 1000, targetY: 1800, color: "#2ecc71", label: "SHRINE" }
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

    // -------- REGISTER --------
    socket.on("register", (data) => {
        const name = (data.name || "").trim();
        if (!name || !data.password) return;

        if (users[name]) {
            socket.emit("authError", "User exists");
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
            portals: PORTALS,
            self: players[socket.id]
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
            if (p.room === pt.fromRoom &&
                Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
            }
        }
    });

    // -------- ATTACK --------
    socket.on("attack", (d) => {
        const p = players[socket.id];
        if (!p) return;

        const angle = Math.atan2(d.y - p.y, d.x - p.x);

        projectiles.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * 12,
            vy: Math.sin(angle) * 12,
            owner: socket.id,
            room: p.room,
            damage: p.str
        });
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
                        p.xp = Math.max(0, p.xp - 20);
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

        // hit monsters
        monsters.forEach(m => {
            if (!m.alive || m.room !== pr.room) return;

            if (Math.hypot(pr.x - m.x, pr.y - m.y) < 30) {
                m.hp -= pr.damage;
                projectiles.splice(i, 1);

                if (m.hp <= 0) {
                    m.alive = false;

                    const owner = players[pr.owner];
                    if (owner) {
                        owner.gold += m.gold;
                        owner.xp += m.xp;

                        // LEVEL UP
                        if (owner.xp >= owner.xpToNext) {
                            owner.level++;
                            owner.xp = 0;
                            owner.xpToNext = Math.floor(owner.xpToNext * 1.2);
                            owner.skillPoints++;
                        }
                    }

                    setTimeout(() => {
                        m.alive = true;
                        m.hp = m.maxHp;
                    }, 8000);
                }
            }
        });

        if (pr.x < 0 || pr.y < 0 || pr.x > 2000 || pr.y > 2000) {
            projectiles.splice(i, 1);
        }
    }

    io.emit("update", {
        players,
        monsters,
        projectiles
    });

}, 1000 / 30);

// ===================== START =====================
server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on", PORT);
});
