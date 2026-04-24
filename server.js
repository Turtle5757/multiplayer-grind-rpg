const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static('public'));

// --- DATA ---
const DATA_FILE = './data.json';
let users = {};

if (fs.existsSync(DATA_FILE)) {
    users = JSON.parse(fs.readFileSync(DATA_FILE));
}

// --- WORLD ---
const WORLD_SIZE = 2000;

// --- XP / LEVEL SYSTEM ---
function xpNeeded(level) {
    return Math.floor(100 * Math.pow(1.15, level));
}

// --- PORTALS (FIXED FULL VERSION) ---
const PORTALS = [
    { fromRoom: 'hub', toRoom: 'gym', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'GYM' },
    { fromRoom: 'hub', toRoom: 'lake', x: 1900, y: 1000, targetX: 200, targetY: 1000, color: '#3498db', label: 'LAKE' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#2ecc71', label: 'SHRINE' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#f1c40f', label: 'SHOP' },
    { fromRoom: 'gym', toRoom: 'hub', x: 1900, y: 1000, targetX: 150, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'lake', toRoom: 'hub', x: 100, y: 1000, targetX: 1850, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shrine', toRoom: 'hub', x: 1000, y: 1900, targetX: 1000, targetY: 150, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 100, targetX: 1000, targetY: 1850, color: '#fff', label: 'EXIT' }
];

// --- STATE ---
let players = {};
let projectiles = [];

let monsters = [
    { id: 1, x: 400, y: 400, hp: 250, maxHp: 250, str: 35, gold: 50, xp: 40, room: 'graveyard', isAlive: true, spd: 2.5 },
    { id: 'BOSS', x: 1000, y: 1000, hp: 8000, maxHp: 8000, str: 150, gold: 2500, xp: 1000, room: 'boss_room', isAlive: true, spd: 2 }
];

// --- SAVE ---
function save() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// --- RESPawn ---
function respawn(p) {
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.room = 'hub';
    p.x = 1000;
    p.y = 1000;
}

// --- CONNECTION ---
io.on('connection', (socket) => {

    // REGISTER
    socket.on('register', (data) => {
        if (!users[data.name]) {
            users[data.name] = {
                password: data.password,
                charClass: data.charClass,

                level: 1,
                xp: 0,
                prestige: 0,

                str: 10,
                def: 5,
                spd: 4,

                gold: 0,
                skillPoints: 1,

                upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
                gear: { sword: 0, armor: 0, boots: 0 }
            };
            save();
            socket.emit('authMessage', 'Registered!');
        }
    });

    // LOGIN
    socket.on('login', (data) => {
        const u = users[data.name];
        if (!u || u.password !== data.password) return socket.emit('authError', 'Login Failed.');

        players[socket.id] = {
            id: socket.id,
            name: data.name,
            charClass: u.charClass,

            level: u.level,
            xp: u.xp,
            prestige: u.prestige,

            x: 1000,
            y: 1000,
            room: 'hub',

            hp: 100,
            maxHp: 100,
            mana: 100,
            maxMana: 100,

            gold: u.gold,
            str: u.str,
            def: u.def,
            spd: u.spd,

            skillPoints: u.skillPoints,
            upgrades: u.upgrades,
            gear: u.gear,

            buffs: { str: 1.0 },
            keys: {}
        };

        socket.emit('init', { id: socket.id, portals: PORTALS });
    });

    // --- SKILL UPGRADE ---
    socket.on('upgradeSkill', (skill) => {
        const p = players[socket.id];
        if (!p || p.skillPoints <= 0) return;

        const limits = { start: 5, ult: 3, branchA: 3, branchB: 3 };
        if (p.upgrades[skill] >= limits[skill]) return;

        p.upgrades[skill]++;
        p.skillPoints--;

        if (skill === 'branchB') {
            p.maxHp += 60;
            p.hp += 60;
        }
    });

    // --- MOVE ---
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.keys = data.keys;

        let speed = p.spd;

        if (p.keys.w) p.y -= speed;
        if (p.keys.s) p.y += speed;
        if (p.keys.a) p.x -= speed;
        if (p.keys.d) p.x += speed;

        p.x = Math.max(0, Math.min(WORLD_SIZE, p.x));
        p.y = Math.max(0, Math.min(WORLD_SIZE, p.y));

        PORTALS.forEach(pt => {
            if (p.room === pt.fromRoom &&
                Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
            }
        });
    });

    // --- ATTACK + XP SYSTEM ---
    socket.on('attack', (data) => {
        const p = players[socket.id];
        if (!p || p.room === 'hub') return;

        monsters.forEach(m => {
            if (m.isAlive && m.room === p.room &&
                Math.hypot(p.x - m.x, p.y - m.y) < 120) {

                m.hp -= p.str;

                if (m.hp <= 0) {
                    m.isAlive = false;

                    p.gold += m.gold;
                    p.xp += m.xp;

                    // LEVEL UP
                    while (p.xp >= xpNeeded(p.level)) {
                        p.xp -= xpNeeded(p.level);
                        p.level++;
                        p.skillPoints += 2;

                        p.maxHp += 10;
                        p.str += 1;
                    }

                    setTimeout(() => {
                        m.isAlive = true;
                        m.hp = m.maxHp;
                    }, 15000);
                }
            }
        });
    });

    // --- DISCONNECT SAVE ---
    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (!p) return;

        users[p.name] = {
            ...users[p.name],

            level: p.level,
            xp: p.xp,
            prestige: p.prestige,

            str: p.str,
            def: p.def,
            spd: p.spd,

            gold: p.gold,
            skillPoints: p.skillPoints,
            upgrades: p.upgrades,
            gear: p.gear
        };

        save();
        delete players[socket.id];
    });
});

// --- LOOP ---
setInterval(() => {
    io.emit('update', { players, monsters, projectiles });
}, 1000 / 30);

// --- PORT ---
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log("Running on " + PORT));
