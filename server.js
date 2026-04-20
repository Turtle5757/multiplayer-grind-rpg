const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- PERSISTENCE ---
let db = { users: {} };
const DB_PATH = './users.json';
if (fs.existsSync(DB_PATH)) {
    try { db = JSON.parse(fs.readFileSync(DB_PATH)); } catch (e) { console.log("DB Loaded"); }
}
function saveDB() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// --- STATE ---
let players = {};
let projectiles = [];
let monsters = [
    { id: 101, x: 400, y: 300, hp: 100, maxHp: 100, str: 10, room: 'dungeon', isAlive: true, spd: 1.5 },
    { id: 102, x: 200, y: 500, hp: 250, maxHp: 250, str: 18, room: 'dungeon', isAlive: true, spd: 1.2 }
];

const rooms = {
    hub: { name: "Village", bg: "#15220d", pvp: false },
    gym: { name: "Gym", bg: "#222", pvp: false },
    track: { name: "Track", bg: "#3d2b1f", pvp: false },
    lake: { name: "Lake", bg: "#001f3f", pvp: false },
    dungeon: { name: "Dungeon", bg: "#1a0000", pvp: false },
    arena: { name: "Arena", bg: "#4a0000", pvp: true },
    shop: { name: "Shop", bg: "#2c3e50", pvp: false }
};

const portals = [
    { fromRoom: 'hub', toRoom: 'track', x: 400, y: 100, targetX: 400, targetY: 500, color: '#aaa', label: 'Speedway' },
    { fromRoom: 'hub', toRoom: 'gym', x: 400, y: 500, targetX: 400, targetY: 150, color: '#aaa', label: 'Gym' },
    { fromRoom: 'hub', toRoom: 'lake', x: 100, y: 300, targetX: 650, targetY: 300, color: '#00ccff', label: 'Zen Lake' },
    { fromRoom: 'hub', toRoom: 'dungeon', x: 700, y: 300, targetX: 150, targetY: 300, color: '#aa3333', label: 'Dungeon' },
    { fromRoom: 'hub', toRoom: 'shop', x: 700, y: 100, targetX: 400, targetY: 500, color: '#f1c40f', label: 'Blacksmith' },
    { fromRoom: 'track', toRoom: 'hub', x: 400, y: 550, targetX: 400, targetY: 200, color: '#fff', label: 'Village' },
    { fromRoom: 'gym', toRoom: 'hub', x: 400, y: 50, targetX: 400, targetY: 400, color: '#fff', label: 'Village' },
    { fromRoom: 'lake', toRoom: 'hub', x: 750, y: 300, targetX: 200, targetY: 300, color: '#fff', label: 'Village' },
    { fromRoom: 'dungeon', toRoom: 'hub', x: 50, y: 300, targetX: 600, targetY: 300, color: '#fff', label: 'Village' },
    { fromRoom: 'shop', toRoom: 'hub', x: 400, y: 550, targetX: 700, targetY: 200, color: '#fff', label: 'Village' },
    { fromRoom: 'gym', toRoom: 'arena', x: 400, y: 550, targetX: 400, targetY: 150, color: '#ff3333', label: 'ARENA' },
    { fromRoom: 'arena', toRoom: 'gym', x: 400, y: 50, targetX: 400, targetY: 450, color: '#fff', label: 'Gym' }
];

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const username = data.name.toLowerCase();
        if (db.users[username]) {
            if (db.users[username].password !== data.password) return socket.emit('loginError', 'Wrong password!');
            players[socket.id] = { ...db.users[username], x: 450, y: 350, room: 'hub', lastTeleport: 0 };
        } else {
            let stats = { str: 10, def: 5, spd: 3, maxHp: 100 };
            if (data.charClass === 'Warrior') stats = { str: 18, def: 12, spd: 2.2, maxHp: 160 };
            if (data.charClass === 'Archer') stats = { str: 12, def: 6, spd: 5.5, maxHp: 110 };
            if (data.charClass === 'Mage') stats = { str: 28, def: 2, spd: 3.2, maxHp: 85 };
            const newAcc = {
                name: data.name, password: data.password, charClass: data.charClass,
                level: 1, hp: stats.maxHp, maxHp: stats.maxHp, xp: 0, nextLevel: 100,
                str: stats.str, def: stats.def, spd: stats.spd, gold: 0,
                color: `hsl(${Math.random() * 360}, 70%, 50%)`
            };
            db.users[username] = newAcc; saveDB();
            players[socket.id] = { ...newAcc, x: 450, y: 350, room: 'hub', lastTeleport: 0 };
        }
        socket.emit('init', { id: socket.id, players, monsters, rooms, portals });
    });

    socket.on('move', (keys) => {
        const p = players[socket.id];
        if (!p) return;
        const isMoving = keys.w || keys.s || keys.a || keys.d;
        if (keys.w) p.y -= p.spd; if (keys.s) p.y += p.spd; 
        if (keys.a) p.x -= p.spd; if (keys.d) p.x += p.spd;
        
        // --- TRAINING ---
        if (p.room === 'track' && isMoving) p.spd += 0.0012; 
        if (p.room === 'lake' && !isMoving) p.def += 0.018;

        p.x = Math.max(20, Math.min(780, p.x)); p.y = Math.max(20, Math.min(580, p.y));

        let now = Date.now();
        if (now - p.lastTeleport > 1000) {
            portals.forEach(pt => {
                if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 35) {
                    p.room = pt.toRoom; p.x = pt.targetX; p.y = pt.targetY; p.lastTeleport = now;
                }
            });
        }
    });

    socket.on('attack', (mouse) => {
        const p = players[socket.id]; if (!p || p.hp <= 0) return;
        if (p.room === 'gym') { p.str += 0.09; return; }

        if (p.charClass === 'Warrior') {
            monsters.forEach(m => {
                if (m.room === p.room && m.isAlive && Math.hypot(p.x - m.x, p.y - m.y) < 85) {
                    m.hp -= (p.str / 3);
                    if (m.hp <= 0) { m.isAlive = false; p.gold += 50; setTimeout(() => m.isAlive = true, 5000); }
                }
            });
            if (rooms[p.room].pvp) {
                for (let id in players) {
                    let target = players[id];
                    if (id !== socket.id && target.room === p.room && Math.hypot(p.x - target.x, p.y - target.y) < 75) {
                        target.hp -= Math.max(2, p.str - (target.def * 0.4));
                        if (target.hp <= 0) { target.hp = target.maxHp; target.room = 'hub'; target.x = 450; target.y = 350; }
                    }
                }
            }
        } else {
            const angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
            const speed = p.charClass === 'Archer' ? 14 : 9;
            projectiles.push({
                ownerId: socket.id, x: p.x, y: p.y,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                damage: p.str, room: p.room,
                color: p.charClass === 'Archer' ? '#f1c40f' : '#9b59b6',
                size: p.charClass === 'Archer' ? 5 : 12, range: 45
            });
        }
    });

    socket.on('buyGear', (type) => {
        const p = players[socket.id];
        if (!p || p.room !== 'shop' || p.gold < 150) return;
        p.gold -= 150;
        if (type === 'sword') p.str += 15;
        if (type === 'armor') { p.def += 12; p.maxHp += 60; p.hp = p.maxHp; }
        if (type === 'boots') p.spd += 1.2;
        saveDB();
    });

    socket.on('disconnect', () => { 
        if (players[socket.id]) { db.users[players[socket.id].name.toLowerCase()] = { ...players[socket.id] }; saveDB(); }
        delete players[socket.id]; 
    });
});

setInterval(() => {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let proj = projectiles[i];
        proj.x += proj.vx; proj.y += proj.vy; proj.range--;
        let hit = false;
        monsters.forEach(m => {
            if (m.room === proj.room && m.isAlive && Math.hypot(proj.x - m.x, proj.y - m.y) < 25) {
                m.hp -= proj.damage; hit = true;
                if (m.hp <= 0) { m.isAlive = false; if(players[proj.ownerId]) players[proj.ownerId].gold += 50; setTimeout(() => m.isAlive = true, 5000); }
            }
        });
        if (!hit && rooms[proj.room].pvp) {
            for (let id in players) {
                let target = players[id];
                if (id !== proj.ownerId && target.room === proj.room && Math.hypot(proj.x - target.x, proj.y - target.y) < 20) {
                    target.hp -= Math.max(2, proj.damage - (target.def * 0.4)); hit = true;
                    if (target.hp <= 0) { target.hp = target.maxHp; target.room = 'hub'; target.x = 450; target.y = 350;}
                }
            }
        }
        if (hit || proj.range <= 0) projectiles.splice(i, 1);
    }

    monsters.forEach(m => {
        if (!m.isAlive) return;
        let target = null; let minDist = 250;
        for (let id in players) {
            let p = players[id];
            let d = Math.hypot(m.x - p.x, m.y - p.y);
            if (p.room === m.room && d < minDist) { minDist = d; target = p; }
        }
        if (target) {
            let angle = Math.atan2(target.y - m.y, target.x - m.x);
            m.x += Math.cos(angle) * m.spd; m.y += Math.sin(angle) * m.spd;
            if (minDist < 30 && (!m.lastAtk || Date.now() - m.lastAtk > 1000)) {
                target.hp -= Math.max(1, m.str - (target.def * 0.3)); m.lastAtk = Date.now();
                if (target.hp <= 0) { target.hp = target.maxHp; target.room = 'hub'; target.x = 450; target.y = 350; }
            }
        }
    });
    io.emit('update', { players, monsters, projectiles });
}, 30);

server.listen(process.env.PORT || 3000);
