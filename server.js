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

// --- WORLD CONSTANTS ---
const WORLD_SIZE = 2000;

// --- GAME STATE ---
let players = {};
let projectiles = [];
let monsters = [
    // Dungeon Mobs
    { id: 101, x: 500, y: 500, spawnX: 500, spawnY: 500, hp: 150, maxHp: 150, str: 15, room: 'dungeon', isAlive: true, spd: 2.0 },
    { id: 102, x: 1500, y: 1500, spawnX: 1500, spawnY: 1500, hp: 300, maxHp: 300, str: 25, room: 'dungeon', isAlive: true, spd: 1.5 },
    { id: 103, x: 1000, y: 800, spawnX: 1000, spawnY: 800, hp: 200, maxHp: 200, str: 20, room: 'dungeon', isAlive: true, spd: 1.8 },
    
    // THE WORLD BOSS (Located in the Lair)
    { id: 999, x: 1000, y: 1000, spawnX: 1000, spawnY: 1000, hp: 5000, maxHp: 5000, str: 65, room: 'lair', isAlive: true, spd: 1.2, isBoss: true }
];

const rooms = {
    hub: { name: "Village", bg: "#15220d", pvp: false },
    gym: { name: "Gym", bg: "#222", pvp: false },
    track: { name: "Track", bg: "#3d2b1f", pvp: false },
    lake: { name: "Lake", bg: "#001f3f", pvp: false },
    dungeon: { name: "Dungeon", bg: "#1a0000", pvp: false },
    arena: { name: "Arena", bg: "#4a0000", pvp: true },
    shop: { name: "Shop", bg: "#2c3e50", pvp: false },
    lair: { name: "Boss Lair", bg: "#2a0033", pvp: false }
};

const portals = [
    // From Village (Hub)
    { fromRoom: 'hub', toRoom: 'track', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#aaa', label: 'Speedway' },
    { fromRoom: 'hub', toRoom: 'gym', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#aaa', label: 'Gym' },
    { fromRoom: 'hub', toRoom: 'lake', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#00ccff', label: 'Zen Lake' },
    { fromRoom: 'hub', toRoom: 'dungeon', x: 1900, y: 1000, targetX: 200, targetY: 1000, color: '#aa3333', label: 'Dungeon' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1700, y: 300, targetX: 1000, targetY: 1800, color: '#f1c40f', label: 'Blacksmith' },

    // From Dungeon
    { fromRoom: 'dungeon', toRoom: 'hub', x: 100, y: 1000, targetX: 1700, targetY: 1000, color: '#fff', label: 'Village' },
    { fromRoom: 'dungeon', toRoom: 'lair', x: 1800, y: 1000, targetX: 200, targetY: 1000, color: '#8e44ad', label: 'BOSS LAIR' },

    // From Lair
    { fromRoom: 'lair', toRoom: 'dungeon', x: 100, y: 1000, targetX: 1600, targetY: 1000, color: '#fff', label: 'Escape' },

    // From Other Zones back to Hub
    { fromRoom: 'track', toRoom: 'hub', x: 1000, y: 1950, targetX: 1000, targetY: 300, color: '#fff', label: 'Village' },
    { fromRoom: 'gym', toRoom: 'hub', x: 1000, y: 50, targetX: 1000, targetY: 1700, color: '#fff', label: 'Village' },
    { fromRoom: 'lake', toRoom: 'hub', x: 1950, y: 1000, targetX: 300, targetY: 1000, color: '#fff', label: 'Village' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 1950, targetX: 1600, targetY: 400, color: '#fff', label: 'Village' },

    // From Gym to Arena (PVP)
    { fromRoom: 'gym', toRoom: 'arena', x: 1800, y: 1000, targetX: 200, targetY: 1000, color: '#ff3333', label: 'PVP ARENA' },
    { fromRoom: 'arena', toRoom: 'gym', x: 100, y: 1000, targetX: 1600, targetY: 1000, color: '#fff', label: 'Gym' }
];

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const username = data.name.toLowerCase();
        if (db.users[username]) {
            if (db.users[username].password !== data.password) return socket.emit('msg', 'System: Wrong password!');
            players[socket.id] = { ...db.users[username], x: 1000, y: 1000, room: 'hub', lastTeleport: 0 };
        } else {
            let s = { str: 10, def: 5, spd: 3, maxHp: 100 };
            if (data.charClass === 'Warrior') s = { str: 18, def: 12, spd: 2.2, maxHp: 160 };
            if (data.charClass === 'Archer') s = { str: 12, def: 6, spd: 5.5, maxHp: 110 };
            if (data.charClass === 'Mage') s = { str: 28, def: 2, spd: 3.2, maxHp: 85 };
            
            players[socket.id] = { 
                name: data.name, password: data.password, charClass: data.charClass,
                level: 1, hp: s.maxHp, maxHp: s.maxHp, str: s.str, def: s.def, spd: s.spd, 
                gold: 0, room: 'hub', x: 1000, y: 1000, lastTeleport: 0,
                color: `hsl(${Math.random() * 360}, 70%, 50%)` 
            };
            db.users[username] = players[socket.id]; saveDB();
        }
        socket.emit('init', { id: socket.id, players, monsters, rooms, portals });
    });

    socket.on('chat', (msg) => {
        const p = players[socket.id];
        if (p && msg.trim()) io.emit('msg', `[${p.name}]: ${msg.substring(0, 80)}`);
    });

    socket.on('move', (keys) => {
        const p = players[socket.id]; if (!p || p.hp <= 0) return;
        const moving = keys.w || keys.s || keys.a || keys.d;
        
        if (keys.w) p.y -= p.spd; if (keys.s) p.y += p.spd; 
        if (keys.a) p.x -= p.spd; if (keys.d) p.x += p.spd;
        
        if (p.room === 'track' && moving) p.spd += 0.002; 
        if (p.room === 'lake' && !moving) p.def += 0.025;
        
        p.x = Math.max(30, Math.min(WORLD_SIZE - 30, p.x)); 
        p.y = Math.max(30, Math.min(WORLD_SIZE - 30, p.y));

        let now = Date.now();
        if (now - p.lastTeleport > 1000) {
            portals.forEach(pt => {
                if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                    p.room = pt.toRoom; p.x = pt.targetX; p.y = pt.targetY; p.lastTeleport = now;
                }
            });
        }
    });

    socket.on('attack', (mouse) => {
        const p = players[socket.id]; if (!p || p.hp <= 0) return;
        if (p.room === 'gym') { p.str += 0.2; return; }

        if (p.charClass === 'Warrior') {
            monsters.forEach(m => {
                if (m.room === p.room && m.isAlive && Math.hypot(p.x - m.x, p.y - m.y) < 100) {
                    m.hp -= (p.str / 2);
                    if (m.hp <= 0) killMonster(m, p);
                }
            });
            if (rooms[p.room].pvp) {
                for (let id in players) {
                    let target = players[id];
                    if (id !== socket.id && target.room === p.room && Math.hypot(p.x - target.x, p.y - target.y) < 90) {
                        target.hp -= Math.max(2, p.str - (target.def * 0.5));
                        if (target.hp <= 0) killPlayer(target, p);
                    }
                }
            }
        } else {
            const angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
            projectiles.push({
                ownerId: socket.id, x: p.x, y: p.y,
                vx: Math.cos(angle) * (p.charClass === 'Archer' ? 16 : 11),
                vy: Math.sin(angle) * (p.charClass === 'Archer' ? 16 : 11),
                damage: p.str, room: p.room, range: 75,
                color: p.charClass === 'Archer' ? '#f1c40f' : '#9b59b6',
                size: p.charClass === 'Archer' ? 6 : 14
            });
        }
    });

    socket.on('buyGear', (type) => {
        const p = players[socket.id];
        if (!p || p.room !== 'shop' || p.gold < 150) return;
        p.gold -= 150;
        if (type === 'sword') p.str += 25;
        if (type === 'armor') { p.def += 20; p.maxHp += 100; p.hp = p.maxHp; }
        if (type === 'boots') p.spd += 2.0;
        io.to(socket.id).emit('msg', `Blacksmith: Built you a fine ${type}!`);
        saveDB();
    });

    socket.on('disconnect', () => { 
        if (players[socket.id]) { db.users[players[socket.id].name.toLowerCase()] = { ...players[socket.id] }; saveDB(); }
        delete players[socket.id]; 
    });
});

function killMonster(m, killer) {
    m.isAlive = false;
    killer.gold += m.isBoss ? 1000 : 75;
    if (m.isBoss) io.emit('msg', `SERVER: ${killer.name.toUpperCase()} HAS SLAIN THE BOSS!`);
    setTimeout(() => { m.hp = m.maxHp; m.isAlive = true; }, m.isBoss ? 60000 : 7000);
}

function killPlayer(target, killer) {
    const bounty = Math.floor(target.gold * 0.1);
    if (killer) {
        killer.gold += bounty;
        io.emit('msg', `PvP: ${killer.name} killed ${target.name} and took ${bounty}g!`);
    }
    target.gold -= bounty;
    target.hp = target.maxHp; 
    target.room = 'hub'; target.x = 1000; target.y = 1000;
}

// Physics Loop
setInterval(() => {
    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let prj = projectiles[i];
        prj.x += prj.vx; prj.y += prj.vy; prj.range--;
        let hit = false;
        monsters.forEach(m => {
            if (m.room === prj.room && m.isAlive && Math.hypot(prj.x - m.x, prj.y - m.y) < 35) {
                m.hp -= prj.damage; hit = true;
                if (m.hp <= 0) killMonster(m, players[prj.ownerId]);
            }
        });
        if (!hit && rooms[prj.room].pvp) {
            for (let id in players) {
                let t = players[id];
                if (id !== prj.ownerId && t.room === prj.room && Math.hypot(prj.x - t.x, prj.y - t.y) < 25) {
                    t.hp -= Math.max(2, prj.damage - (t.def * 0.5)); hit = true;
                    if (t.hp <= 0) killPlayer(t, players[prj.ownerId]);
                }
            }
        }
        if (hit || prj.range <= 0) projectiles.splice(i, 1);
    }

    // AI
    monsters.forEach(m => {
        if (!m.isAlive) return;
        let target = null, minDist = 600;
        for (let id in players) {
            let p = players[id];
            let d = Math.hypot(m.x - p.x, m.y - p.y);
            if (p.room === m.room && d < minDist) { minDist = d; target = p; }
        }
        if (target) {
            let ang = Math.atan2(target.y - m.y, target.x - m.x);
            m.x += Math.cos(ang) * m.spd; m.y += Math.sin(ang) * m.spd;
            if (minDist < 40 && (!m.lastAtk || Date.now() - m.lastAtk > 1000)) {
                target.hp -= Math.max(1, m.str - (target.def * 0.4)); m.lastAtk = Date.now();
                if (target.hp <= 0) killPlayer(target, null);
            }
        } else {
            let dSpn = Math.hypot(m.x - m.spawnX, m.y - m.spawnY);
            if (dSpn > 10) {
                let ang = Math.atan2(m.spawnY - m.y, m.spawnX - m.x);
                m.x += Math.cos(ang) * (m.spd * 0.6); m.y += Math.sin(ang) * (m.spd * 0.6);
            }
        }
    });
    io.emit('update', { players, monsters, projectiles });
}, 30);

server.listen(process.env.PORT || 3000);
