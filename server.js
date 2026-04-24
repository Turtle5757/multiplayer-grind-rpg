const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static('public'));

// --- DATA STORAGE ---
const DATA_FILE = './data.json';
let users = {};

if (fs.existsSync(DATA_FILE)) {
    users = JSON.parse(fs.readFileSync(DATA_FILE));
}

// --- CONFIG ---
const WORLD_SIZE = 2000;
const TICK_RATE = 30;

const GEAR_DATA = {
    sword: [1.0, 1.3, 1.7, 2.2, 3.5],
    armor: [1.0, 1.4, 1.8, 2.5, 4.0],
    boots: [1.0, 1.2, 1.4, 1.7, 2.5]
};

const PORTALS = [
    { fromRoom: 'hub', toRoom: 'gym', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'GYM' },
    { fromRoom: 'hub', toRoom: 'lake', x: 1900, y: 1000, targetX: 1800, targetY: 1000, color: '#3498db', label: 'LAKE' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#2ecc71', label: 'SHRINE' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#f1c40f', label: 'SHOP' },
];

let players = {};
let projectiles = [];

let monsters = [
    { id: 1, x: 400, y: 400, hp: 250, maxHp: 250, str: 35, gold: 50, room: 'graveyard', isAlive: true, spd: 2.5 },
    { id: 'BOSS', x: 1000, y: 1000, hp: 8000, maxHp: 8000, str: 150, gold: 2500, room: 'boss_room', isAlive: true, spd: 2.0, isBoss: true }
];

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

function respawn(p) {
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.room = 'hub';
    p.x = 1000;
    p.y = 1000;
}

io.on('connection', (socket) => {

    // --- AUTH ---
    socket.on('register', (data) => {
        if (!users[data.name]) {
            users[data.name] = {
                password: data.password,
                charClass: data.charClass,
                str: 10, def: 5, spd: 4,
                gold: 0,
                skillPoints: 1,
                upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
                gear: { sword: 0, armor: 0, boots: 0 }
            };
            saveData();
            socket.emit('authMessage', 'Registered!');
        } else socket.emit('authError', 'User exists.');
    });

    socket.on('login', (data) => {
        const u = users[data.name];
        if (u && u.password === data.password) {
            players[socket.id] = {
                id: socket.id,
                name: data.name,
                charClass: u.charClass,
                x: 1000, y: 1000,
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
                cooldowns: { Q: 0, E: 0 },
                keys: {}
            };

            socket.emit('init', { id: socket.id, portals: PORTALS });
        } else socket.emit('authError', 'Login Failed.');
    });

    // --- SKILL SYSTEM (FIXED) ---
    socket.on('upgradeSkill', (skill) => {
        const p = players[socket.id];
        if (!p || p.skillPoints <= 0) return;

        const limits = { start: 5, ult: 3, branchA: 3, branchB: 3 };
        if (p.upgrades[skill] >= limits[skill]) return;

        p.upgrades[skill]++;
        p.skillPoints--;

        if (skill === 'branchB' && p.charClass === 'Warrior') {
            p.maxHp += 60;
            p.hp += 60;
        }
    });

    // --- MOVEMENT ---
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.keys = data.keys;

        let speed = p.spd * GEAR_DATA.boots[p.gear.boots];

        if (p.keys.w) p.y -= speed;
        if (p.keys.s) p.y += speed;
        if (p.keys.a) p.x -= speed;
        if (p.keys.d) p.x += speed;

        p.x = Math.max(0, Math.min(p.x, WORLD_SIZE));
        p.y = Math.max(0, Math.min(p.y, WORLD_SIZE));

        PORTALS.forEach(pt => {
            if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
            }
        });
    });

    socket.on('attack', (targetData) => {
        const p = players[socket.id];
        if (!p || p.room === 'hub') return;

        let damage = p.str;

        monsters.forEach(m => {
            if (m.isAlive && m.room === p.room && Math.hypot(p.x - m.x, p.y - m.y) < 120) {
                m.hp -= damage;

                if (m.hp <= 0) {
                    m.isAlive = false;
                    p.gold += m.gold;

                    setTimeout(() => {
                        m.isAlive = true;
                        m.hp = m.maxHp;
                    }, 15000);
                }
            }
        });
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p) {
            users[p.name] = {
                ...users[p.name],
                str: p.str,
                def: p.def,
                spd: p.spd,
                gold: p.gold,
                skillPoints: p.skillPoints,
                upgrades: p.upgrades,
                gear: p.gear
            };
            saveData();
            delete players[socket.id];
        }
    });
});

// --- GAME LOOP ---
setInterval(() => {
    Object.values(players).forEach(p => {

        const caps = { str: 200, spd: 10, def: 150 };

        if (p.room === 'gym' && p.str < caps.str) {
            p.str += 0.02 * (1 - p.str / caps.str);
        }

        if (p.room === 'lake' && p.spd < caps.spd && Object.values(p.keys).some(k => k)) {
            p.spd += 0.001 * (1 - p.spd / caps.spd);
        }

        if (p.room === 'shrine' && p.def < caps.def && !Object.values(p.keys).some(k => k)) {
            p.def += 0.02 * (1 - p.def / caps.def);
        }
    });

    io.emit('update', { players, monsters, projectiles });
}, TICK_RATE);

// --- FIXED PORT ---
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Running on ' + PORT));
