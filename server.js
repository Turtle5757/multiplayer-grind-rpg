const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- DATABASE PERSISTENCE ---
let db = { users: {} };
const DB_PATH = './users.json'; 
if (fs.existsSync(DB_PATH)) {
    try { db = JSON.parse(fs.readFileSync(DB_PATH)); } catch (e) { console.log("DB Loaded"); }
}
function saveDB() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// --- GAME STATE ---
let players = {};
let resources = [
    { id: 1, x: 150, y: 150, type: 'wood', room: 'hub', hp: 5, respawn: 0 },
    { id: 2, x: 650, y: 450, type: 'stone', room: 'hub', hp: 5, respawn: 0 },
    { id: 3, x: 200, y: 400, type: 'wood', room: 'hub', hp: 5, respawn: 0 }
];

let monsters = [
    { id: 101, x: 400, y: 300, hp: 100, maxHp: 100, str: 10, room: 'dungeon', isAlive: true, spd: 1.5 },
    { id: 102, x: 200, y: 500, hp: 250, maxHp: 250, str: 18, room: 'dungeon', isAlive: true, spd: 1.2 }
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
            if (db.users[username].password !== data.password) {
                socket.emit('loginError', 'Wrong password!');
                return;
            }
            players[socket.id] = { 
                ...db.users[username], 
                x: 450, y: 350, room: 'hub', 
                lastTeleport: 0, 
                backpack: { wood: 0, stone: 0 } 
            };
        } else {
            let stats = { str: 10, def: 5, spd: 3, maxHp: 100 };
            if (data.charClass === 'Warrior') stats = { str: 18, def: 12, spd: 2.2, maxHp: 160 };
            if (data.charClass === 'Archer') stats = { str: 12, def: 6, spd: 5.5, maxHp: 110 };
            if (data.charClass === 'Mage') stats = { str: 28, def: 2, spd: 3.2, maxHp: 85 };

            const newAcc = {
                name: data.name, password: data.password, charClass: data.charClass,
                level: 1, hp: stats.maxHp, maxHp: stats.maxHp, xp: 0, nextLevel: 100,
                str: stats.str, def: stats.def, spd: stats.spd, gold: 0,
                bank: { wood: 0, stone: 0 }, color: `hsl(${Math.random() * 360}, 70%, 50%)`
            };
            db.users[username] = newAcc; saveDB();
            players[socket.id] = { ...newAcc, x: 450, y: 350, room: 'hub', lastTeleport: 0, backpack: { wood: 0, stone: 0 } };
        }
        socket.emit('init', { id: socket.id, players, monsters, resources, rooms, portals });
    });

    socket.on('move', (keys) => {
        const p = players[socket.id];
        if (!p) return;
        const isMoving = keys.w || keys.s || keys.a || keys.d;
        
        if (keys.w) p.y -= p.spd; if (keys.s) p.y += p.spd; 
        if (keys.a) p.x -= p.spd; if (keys.d) p.x += p.spd;

        // --- TRAINING LOGIC ---
        if (p.room === 'track' && isMoving) p.spd += 0.0012; 
        if (p.room === 'lake' && !isMoving) p.def += 0.018;

        p.x = Math.max(20, Math.min(780, p.x)); p.y = Math.max(20, Math.min(580, p.y));

        // STORAGE DEPOSIT
        if (p.room === 'hub' && Math.hypot(p.x - 400, p.y - 300) < 40) {
            if (p.backpack.wood > 0 || p.backpack.stone > 0) {
                p.bank.wood += p.backpack.wood; p.bank.stone += p.backpack.stone;
                p.backpack.wood = 0; p.backpack.stone = 0;
                socket.emit('msg', 'Resources Stored!');
            }
        }

        let now = Date.now();
        if (now - p.lastTeleport > 1000) {
            portals.forEach(pt => {
                if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 35) {
                    p.room = pt.toRoom; p.x = pt.targetX; p.y = pt.targetY; p.lastTeleport = now;
                }
            });
        }
    });

    socket.on('attack', () => {
        const p = players[socket.id]; if (!p) return;
        if (p.room === 'gym') p.str += 0.09;

        let range = p.charClass === 'Archer' ? 180 : p.charClass === 'Mage' ? 130 : 70;

        // PLAYER VS PLAYER (PVP)
        if (rooms[p.room].pvp) {
            for (let id in players) {
                if (id === socket.id) continue;
                let target = players[id];
                if (target.room === p.room && Math.hypot(p.x - target.x, p.y - target.y) < range) {
                    let damage = Math.max(2, p.str - (target.def * 0.4));
                    target.hp -= damage;
                    if (target.hp <= 0) {
                        target.hp = target.maxHp;
                        target.room = 'hub'; target.x = 450; target.y = 350;
                        io.emit('msg', `${p.name} crushed ${target.name}!`);
                    }
                }
            }
        }

        // MONSTERS
        monsters.forEach(m => {
            if (m.room === p.room && m.isAlive && Math.hypot(p.x - m.x, p.y - m.y) < range) {
                m.hp -= (p.str / 3);
                if (m.hp <= 0) {
                    m.isAlive = false; p.xp += 50; p.gold += 30;
                    if (p.xp >= p.nextLevel) { 
                        p.level++; p.xp = 0; p.nextLevel *= 1.4; p.maxHp += 25; p.hp = p.maxHp; 
                    }
                    setTimeout(() => { m.hp = m.maxHp; m.isAlive = true; }, 5000);
                }
            }
        });

        // RESOURCES
        resources.forEach(r => {
            if (r.room === p.room && r.hp > 0 && Math.hypot(p.x - r.x, p.y - r.y) < 60) {
                r.hp--; if (r.hp <= 0) { p.backpack[r.type] += 5; r.respawn = Date.now() + 10000; }
            }
        });
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const uname = players[socket.id].name.toLowerCase();
            db.users[uname] = { ...players[socket.id] };
            delete db.users[uname].backpack; saveDB();
        }
        delete players[socket.id];
    });
});

// --- MAIN LOOP (Monster AI & Respawns) ---
setInterval(() => {
    let now = Date.now();
    resources.forEach(r => { if (r.hp <= 0 && now > r.respawn) r.hp = 5; });

    monsters.forEach(m => {
        if (!m.isAlive) return;
        let target = null;
        let minDist = 300;
        for (let id in players) {
            let p = players[id];
            let d = Math.hypot(m.x - p.x, m.y - p.y);
            if (p.room === m.room && d < minDist) { minDist = d; target = p; }
        }
        if (target) {
            let angle = Math.atan2(target.y - m.y, target.x - m.x);
            m.x += Math.cos(angle) * m.spd; m.y += Math.sin(angle) * m.spd;
            if (minDist < 30 && (!m.lastAttack || now - m.lastAttack > 1000)) {
                target.hp -= Math.max(1, m.str - (target.def * 0.3));
                m.lastAttack = now;
                if (target.hp <= 0) { target.hp = target.maxHp; target.room = 'hub'; target.x = 450; target.y = 350; }
            }
        }
    });
    io.emit('update', { players, monsters, resources });
}, 50);

server.listen(process.env.PORT || 3000, () => console.log("Server Running..."));
