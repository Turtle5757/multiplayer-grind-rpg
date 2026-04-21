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
    try { db = JSON.parse(fs.readFileSync(DB_PATH)); } catch (e) {}
}
function saveDB() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

const WORLD_SIZE = 2000;
let players = {};
let projectiles = [];
let monsters = [
    { id: 101, x: 500, y: 500, spawnX: 500, spawnY: 500, hp: 200, maxHp: 200, str: 20, room: 'dungeon', isAlive: true, spd: 2.2 },
    { id: 102, x: 1500, y: 1500, spawnX: 1500, spawnY: 1500, hp: 400, maxHp: 400, str: 35, room: 'dungeon', isAlive: true, spd: 1.8 },
    { id: 999, x: 1000, y: 1000, spawnX: 1000, spawnY: 1000, hp: 8000, maxHp: 8000, str: 80, room: 'lair', isAlive: true, spd: 1.3, isBoss: true, lastHit: 0 }
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
    { fromRoom: 'hub', toRoom: 'track', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#aaa', label: 'Speedway' },
    { fromRoom: 'hub', toRoom: 'gym', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#aaa', label: 'Gym' },
    { fromRoom: 'hub', toRoom: 'lake', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#00ccff', label: 'Zen Lake' },
    { fromRoom: 'hub', toRoom: 'dungeon', x: 1900, y: 1000, targetX: 200, targetY: 1000, color: '#aa3333', label: 'Dungeon' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1700, y: 300, targetX: 1000, targetY: 1800, color: '#f1c40f', label: 'Blacksmith' },
    { fromRoom: 'dungeon', toRoom: 'hub', x: 100, y: 1000, targetX: 1700, targetY: 1000, color: '#fff', label: 'Village' },
    { fromRoom: 'dungeon', toRoom: 'lair', x: 1800, y: 1000, targetX: 200, targetY: 1000, color: '#8e44ad', label: 'BOSS LAIR' },
    { fromRoom: 'lair', toRoom: 'dungeon', x: 100, y: 1000, targetX: 1600, targetY: 1000, color: '#fff', label: 'Escape' },
    { fromRoom: 'track', toRoom: 'hub', x: 1000, y: 1950, targetX: 1000, targetY: 300, color: '#fff', label: 'Village' },
    { fromRoom: 'gym', toRoom: 'hub', x: 1000, y: 50, targetX: 1000, targetY: 1700, color: '#fff', label: 'Village' },
    { fromRoom: 'lake', toRoom: 'hub', x: 1950, y: 1000, targetX: 300, targetY: 1000, color: '#fff', label: 'Village' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 1950, targetX: 1600, targetY: 400, color: '#fff', label: 'Village' },
    { fromRoom: 'gym', toRoom: 'arena', x: 1800, y: 1000, targetX: 200, targetY: 1000, color: '#ff3333', label: 'PVP ARENA' },
    { fromRoom: 'arena', toRoom: 'gym', x: 100, y: 1000, targetX: 1600, targetY: 1000, color: '#fff', label: 'Gym' }
];

const GEAR_TIERS = {
    weapon: [
        { name: "Bronze Sword", mult: 1.1, cost: 500 },
        { name: "Iron Sword", mult: 1.25, cost: 1500 },
        { name: "Steel Greatsword", mult: 1.4, cost: 4000 },
        { name: "Diamond Blade", mult: 1.6, cost: 10000 }
    ],
    armor: [
        { name: "Bronze Armor", mult: 1.1, hp: 50, cost: 500 },
        { name: "Iron Plate", mult: 1.25, hp: 150, cost: 1500 },
        { name: "Steel Guard", mult: 1.4, hp: 300, cost: 4000 },
        { name: "Diamond Plate", mult: 1.6, hp: 600, cost: 10000 }
    ],
    boots: [
        { name: "Bronze Boots", mult: 1.1, cost: 500 },
        { name: "Iron Boots", mult: 1.2, cost: 1500 },
        { name: "Steel Treads", mult: 1.35, cost: 4000 },
        { name: "Diamond Greaves", mult: 1.5, cost: 10000 }
    ]
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const username = data.name.toLowerCase();
        if (db.users[username]) {
            if (db.users[username].password !== data.password) return socket.emit('msg', 'Wrong password!');
            players[socket.id] = { ...db.users[username], x: 1000, y: 1000, room: 'hub', lastTeleport: 0 };
        } else {
            players[socket.id] = { 
                name: data.name, password: data.password, charClass: data.charClass,
                hp: 100, maxHp: 100, str: 10, def: 5, spd: 3, gold: 0, 
                room: 'hub', x: 1000, y: 1000, lastTeleport: 0,
                equips: { weapon: "None", armor: "None", boots: "None" },
                mults: { str: 1.0, def: 1.0, spd: 1.0, hp: 0 },
                color: `hsl(${Math.random() * 360}, 70%, 50%)` 
            };
            db.users[username] = players[socket.id]; saveDB();
        }
        socket.emit('init', { id: socket.id, players, monsters, rooms, portals, GEAR_TIERS });
    });

    socket.on('chat', (msg) => {
        const p = players[socket.id];
        if (p) io.emit('msg', `[${p.name}]: ${msg.substring(0, 60)}`);
    });

    socket.on('move', (keys) => {
        const p = players[socket.id]; if (!p || p.hp <= 0) return;
        const moving = keys.w || keys.s || keys.a || keys.d;
        let s = p.spd;
        if (keys.w) p.y -= s; if (keys.s) p.y += s; 
        if (keys.a) p.x -= s; if (keys.d) p.x += s;
        
        if (p.room === 'track' && moving) p.spd += (0.001 * p.mults.spd); 
        if (p.room === 'lake' && !moving) p.def += (0.02 * p.mults.def);
        
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
        if (p.room === 'gym') { p.str += (0.15 * p.mults.str); return; }

        const angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
        projectiles.push({
            ownerId: socket.id, x: p.x, y: p.y,
            vx: Math.cos(angle) * (p.charClass === 'Archer' ? 15 : 10),
            vy: Math.sin(angle) * (p.charClass === 'Archer' ? 15 : 10),
            damage: p.str, room: p.room, range: 60,
            color: p.color
        });
    });

    socket.on('buyGear', (data) => {
        const p = players[socket.id];
        const tierObj = GEAR_TIERS[data.type][data.tier];
        if (!p || p.room !== 'shop' || p.gold < tierObj.cost) return;

        p.gold -= tierObj.cost;
        p.equips[data.type] = tierObj.name;
        
        if (data.type === 'weapon') p.mults.str = tierObj.mult;
        if (data.type === 'boots') p.mults.spd = tierObj.mult;
        if (data.type === 'armor') {
            p.mults.def = tierObj.mult;
            p.maxHp = 100 + tierObj.hp;
            p.hp = p.maxHp;
        }
        
        socket.emit('msg', `Shop: Purchased ${tierObj.name}!`);
        saveDB();
    });

    socket.on('disconnect', () => { 
        if (players[socket.id]) { db.users[players[socket.id].name.toLowerCase()] = { ...players[socket.id] }; saveDB(); }
        delete players[socket.id]; 
    });
});

function killMonster(m, killer) {
    m.isAlive = false;
    killer.gold += m.isBoss ? 2500 : 120;
    if (m.isBoss) io.emit('msg', `SERVER: ${killer.name} SLAUGHTERED THE BOSS!`);
    setTimeout(() => { m.hp = m.maxHp; m.isAlive = true; }, m.isBoss ? 45000 : 8000);
}

function killPlayer(target, killer) {
    const loss = Math.floor(target.gold * 0.15);
    if (killer) { killer.gold += loss; io.emit('msg', `${killer.name} executed ${target.name} (-${loss}g)`); }
    target.gold -= loss;
    target.hp = target.maxHp; target.room = 'hub'; target.x = 1000; target.y = 1000;
}

setInterval(() => {
    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let prj = projectiles[i];
        prj.x += prj.vx; prj.y += prj.vy; prj.range--;
        let hit = false;
        monsters.forEach(m => {
            if (m.room === prj.room && m.isAlive && Math.hypot(prj.x - m.x, prj.y - m.y) < 40) {
                let dmg = prj.damage;
                if (m.isBoss) {
                    dmg = Math.max(5, dmg * 0.5); // Boss has inherent 50% damage reduction
                    m.lastHit = Date.now();
                }
                m.hp -= dmg; hit = true;
                if (m.hp <= 0) killMonster(m, players[prj.ownerId]);
            }
        });
        if (hit || prj.range <= 0) projectiles.splice(i, 1);
    }

    // AI & Boss Regen
    monsters.forEach(m => {
        if (!m.isAlive) return;
        if (m.isBoss && Date.now() - m.lastHit > 5000) {
            m.hp = Math.min(m.maxHp, m.hp + 25); // Heals 25hp per tick if ignored
        }
        let target = null, minDist = 500;
        for (let id in players) {
            let p = players[id];
            let d = Math.hypot(m.x - p.x, m.y - p.y);
            if (p.room === m.room && d < minDist) { minDist = d; target = p; }
        }
        if (target) {
            let ang = Math.atan2(target.y - m.y, target.x - m.x);
            m.x += Math.cos(ang) * m.spd; m.y += Math.sin(ang) * m.spd;
            if (minDist < 45 && (!m.lastAtk || Date.now() - m.lastAtk > 1000)) {
                target.hp -= Math.max(5, m.str - (target.def * 0.3)); m.lastAtk = Date.now();
                if (target.hp <= 0) killPlayer(target, null);
            }
        }
    });
    io.emit('update', { players, monsters, projectiles });
}, 30);

server.listen(process.env.PORT || 3000);
