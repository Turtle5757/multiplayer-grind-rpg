const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let db = { users: {} };
const DB_PATH = './users.json'; 

if (fs.existsSync(DB_PATH)) {
    try { db = JSON.parse(fs.readFileSync(DB_PATH)); } catch (e) { console.log("DB Load Error"); }
}

function saveDB() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

let players = {};
let monsters = [
    { id: 1, x: 400, y: 300, hp: 100, maxHp: 100, str: 8, room: 'dungeon', isAlive: true, type: 'slime' },
    { id: 2, x: 200, y: 500, hp: 250, maxHp: 250, str: 15, room: 'dungeon', isAlive: true, type: 'skeleton' }
];

const rooms = {
    hub: { name: "Main Village", bg: "#15220d", floor: '#2a3d23', pvp: false },
    gym: { name: "The Iron Gym", bg: "#222", floor: '#444', pvp: false },
    track: { name: "Speedway", bg: "#3d2b1f", floor: '#7f6c58', pvp: false },
    lake: { name: "Zen Lake", bg: "#001f3f", floor: '#0e3155', pvp: false },
    dungeon: { name: "Monster Dungeon", bg: "#1a0000", floor: '#331111', pvp: false },
    arena: { name: "PVP ARENA", bg: "#4a0000", floor: '#661a00', pvp: true }
};

const portals = [
    { fromRoom: 'hub', toRoom: 'track', x: 400, y: 100, targetX: 400, targetY: 500, color: '#aaa', label: 'Speedway' },
    { fromRoom: 'hub', toRoom: 'gym', x: 400, y: 500, targetX: 400, targetY: 150, color: '#aaa', label: 'Gym' },
    { fromRoom: 'hub', toRoom: 'lake', x: 100, y: 300, targetX: 650, targetY: 300, color: '#00ccff', label: 'Lake' },
    { fromRoom: 'hub', toRoom: 'dungeon', x: 700, y: 300, targetX: 150, targetY: 300, color: '#aa3333', label: 'Dungeon' },
    { fromRoom: 'track', toRoom: 'hub', x: 400, y: 550, targetX: 400, targetY: 200, color: '#fff', label: 'Village' },
    { fromRoom: 'gym', toRoom: 'hub', x: 400, y: 50, targetX: 400, targetY: 400, color: '#fff', label: 'Village' },
    { fromRoom: 'lake', toRoom: 'hub', x: 750, y: 300, targetX: 200, targetY: 300, color: '#fff', label: 'Village' },
    { fromRoom: 'dungeon', toRoom: 'hub', x: 50, y: 300, targetX: 600, targetY: 300, color: '#fff', label: 'Village' },
    { fromRoom: 'gym', toRoom: 'arena', x: 400, y: 550, targetX: 400, targetY: 150, color: '#ff3333', label: 'PVP ARENA!' },
    { fromRoom: 'arena', toRoom: 'gym', x: 400, y: 50, targetX: 400, targetY: 450, color: '#fff', label: 'Iron Gym' }
];

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const username = data.name.toLowerCase();
        if (db.users[username]) {
            if (db.users[username].password !== data.password) { socket.emit('loginError', 'Wrong password!'); return; }
            players[socket.id] = { ...db.users[username], x: 400, y: 300, room: 'hub', lastTeleport: 0, clickTimes: [] };
        } else {
            let stats = { str: 10, def: 5, spd: 3, maxHp: 100 };
            if (data.charClass === 'Warrior') stats = { str: 18, def: 10, spd: 2, maxHp: 160 };
            if (data.charClass === 'Archer') stats = { str: 12, def: 4, spd: 5.5, maxHp: 110 };
            if (data.charClass === 'Mage') stats = { str: 25, def: 2, spd: 3, maxHp: 90 };
            const newAcc = {
                name: data.name, password: data.password, charClass: data.charClass,
                level: 1, hp: stats.maxHp, maxHp: stats.maxHp, xp: 0, nextLevel: 100,
                str: stats.str, def: stats.def, spd: stats.spd, gold: 0,
                color: `hsl(${Math.random() * 360}, 70%, 50%)`
            };
            db.users[username] = newAcc; saveDB();
            players[socket.id] = { ...newAcc, x: 400, y: 300, room: 'hub', lastTeleport: 0, clickTimes: [] };
        }
        socket.emit('init', { id: socket.id, players, monsters, rooms, portals });
    });

    socket.on('move', (keys) => {
        const p = players[socket.id];
        if (!p) return;
        const isMoving = keys.w || keys.s || keys.a || keys.d;
        if (keys.w) p.y -= p.spd; if (keys.s) p.y += p.spd; if (keys.a) p.x -= p.spd; if (keys.d) p.x += p.spd;
        p.x = Math.max(20, Math.min(780, p.x)); p.y = Math.max(20, Math.min(580, p.y));

        // ACTIVE TRAINING
        if (p.room === 'track' && isMoving) p.spd += 0.002;
        if (p.room === 'lake' && !isMoving) p.def += 0.02;

        let now = Date.now();
        if (now - p.lastTeleport > 1000) {
            portals.forEach(pt => {
                if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 35) {
                    p.room = pt.toRoom; p.x = pt.targetX; p.y = pt.targetY; p.lastTeleport = now;
                }
            });
        }
        io.emit('update', { players, monsters });
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p) return;

        // --- ANTICLICKER PREVENTION ---
        let now = Date.now();
        if (p.lastClick) {
            let diff = now - p.lastClick;
            if (diff < 100) return; // Cap at 10 clicks per second
            p.clickTimes.push(diff);
            if (p.clickTimes.length > 10) {
                p.clickTimes.shift();
                let sum = p.clickTimes.reduce((a, b) => a + b);
                let avg = sum / 10;
                let variance = p.clickTimes.every(v => Math.abs(v - avg) < 2);
                if (variance) { socket.emit('loginError', "Autoclicker detected! Slow down."); return; }
            }
        }
        p.lastClick = now;

        // TRAINING: GYM
        if (p.room === 'gym') p.str += 0.1;

        // COMBAT
        let range = p.charClass === 'Archer' ? 160 : p.charClass === 'Mage' ? 110 : 70;
        monsters.forEach(m => {
            if (m.room === p.room && m.isAlive && Math.hypot(p.x - m.x, p.y - m.y) < range) {
                m.hp -= p.str / 4;
                if (m.hp <= 0) {
                    m.isAlive = false; p.xp += 50; p.gold += 30;
                    if (p.xp >= p.nextLevel) { p.level++; p.xp = 0; p.nextLevel *= 1.5; p.maxHp += 20; p.hp = p.maxHp; }
                    setTimeout(() => { m.hp = m.maxHp; m.isAlive = true; }, 5000);
                }
            }
        });

        if (rooms[p.room].pvp) {
            for (let id in players) {
                if (id === socket.id) continue;
                let t = players[id];
                if (t.room === p.room && Math.hypot(p.x - t.x, p.y - t.y) < range) {
                    t.hp -= Math.max(1, p.str - t.def);
                    if (t.hp <= 0) {
                        p.gold += Math.floor(t.gold * 0.2); t.gold = Math.floor(t.gold * 0.8);
                        t.hp = t.maxHp; t.room = 'hub'; t.x = 400; t.y = 300;
                    }
                }
            }
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const username = players[socket.id].name.toLowerCase();
            db.users[username] = { ...players[socket.id] };
            delete db.users[username].clickTimes;
            saveDB();
        }
        delete players[socket.id];
        io.emit('update', { players, monsters });
    });
});

setInterval(saveDB, 60000);
server.listen(process.env.PORT || 3000);
