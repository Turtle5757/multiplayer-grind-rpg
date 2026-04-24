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

// ===================== LOAD USERS =====================
let users = {};
let players = {};
let projectiles = [];
let monsters = [];

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE));
        } else {
            users = {};
            fs.writeFileSync(USERS_FILE, "{}");
        }
    } catch {
        users = {};
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

loadUsers();

// ===================== WORLD =====================
const WORLD_SIZE = 2000;

const PORTALS = [
    { fromRoom: "hub", toRoom: "graveyard", x: 1800, y: 1000, targetX: 300, targetY: 1000, color: "#555", label: "GRAVEYARD" },
    { fromRoom: "graveyard", toRoom: "hub", x: 100, y: 1000, targetX: 1700, targetY: 1000, color: "#fff", label: "EXIT" }
];

// ===================== MONSTERS =====================
function spawnMonsters() {
    monsters = [
        { id: 1, x: 500, y: 500, hp: 200, maxHp: 200, room: "graveyard", alive: true, gold: 20 },
        { id: 2, x: 1200, y: 1200, hp: 300, maxHp: 300, room: "graveyard", alive: true, gold: 40 },
        { id: "BOSS", x: 1000, y: 1000, hp: 2000, maxHp: 2000, room: "graveyard", alive: true, gold: 500 }
    ];
}

spawnMonsters();

// ===================== PLAYER CREATION =====================
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

        skillPoints: u.skillPoints || 0,
        upgrades: u.upgrades || { start: 0, ult: 0, branchA: 0, branchB: 0 },

        gear: u.gear || { sword: 0, armor: 0, boots: 0 },

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
            socket.emit("authError", "Invalid or exists");
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
            portals,
        });
    });

    // -------- MOVE --------
    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.keys = data.keys;

        if (p.keys.w) p.y -= p.spd;
        if (p.keys.s) p.y += p.spd;
        if (p.keys.a) p.x -= p.spd;
        if (p.keys.d) p.x += p.spd;

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
            users[p.name].xp = p.xp;
            saveUsers();
        }

        delete players[socket.id];
    });
});

// ===================== GAME LOOP =====================
setInterval(() => {
    // projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];

        pr.x += pr.vx;
        pr.y += pr.vy;

        for (const m of monsters) {
            if (!m.alive || m.room !== pr.room) continue;

            if (Math.hypot(pr.x - m.x, pr.y - m.y) < 30) {
                m.hp -= pr.damage;
                projectiles.splice(i, 1);

                if (m.hp <= 0) {
                    m.alive = false;

                    const owner = players[pr.owner];
                    if (owner) {
                        owner.gold += m.gold;
                        owner.xp += 25;

                        if (owner.xp >= owner.xpToNext) {
                            owner.level++;
                            owner.xp = 0;
                            owner.xpToNext += 50;
                            owner.skillPoints++;
                        }
                    }

                    setTimeout(() => {
                        m.hp = m.maxHp;
                        m.alive = true;
                    }, 10000);
                }
                break;
            }
        }
    }

    io.emit("update", { players, projectiles, monsters });
}, 1000 / 30);

// ===================== START =====================
server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on", PORT);
});
