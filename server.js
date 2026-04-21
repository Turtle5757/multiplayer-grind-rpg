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
    { id: 999, x: 1000, y: 1000, spawnX: 1000, spawnY: 1000, hp: 12000, maxHp: 12000, str: 95, room: 'lair', isAlive: true, spd: 1.2, isBoss: true, lastHit: 0 }
];

const rooms = {
    hub: { name: "Village", bg: "#15220d" },
    gym: { name: "Gym", bg: "#222" },
    track: { name: "Track", bg: "#3d2b1f" },
    lake: { name: "Lake", bg: "#001f3f" },
    dungeon: { name: "Dungeon", bg: "#1a0000" },
    shop: { name: "Shop", bg: "#2c3e50" },
    lair: { name: "Boss Lair", bg: "#2a0033" }
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
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 1950, targetX: 1600, targetY: 400, color: '#fff', label: 'Village' }
];

const GEAR_TIERS = {
    weapon: [
        { name: "Bronze Sword", mult: 1.1, cost: 800 },
        { name: "Iron Sword", mult: 1.2, cost: 2500 },
        { name: "Steel Greatsword", mult: 1.35, cost: 6000 },
        { name: "Diamond Blade", mult: 1.5, cost: 15000 }
    ],
    armor: [
        { name: "Bronze Armor", mult: 1.1, hp: 50, cost: 800 },
        { name: "Iron Plate", mult: 1.2, hp: 150, cost: 2500 },
        { name: "Steel Guard", mult: 1.35, hp: 400, cost: 6000 },
        { name: "Diamond Plate", mult: 1.5, hp: 1000, cost: 15000 }
    ],
    boots: [
        { name: "Bronze Boots", mult: 1.1, cost: 800 },
        { name: "Iron Boots", mult: 1.2, cost: 2500 },
        { name: "Steel Treads", mult: 1.3, cost: 6000 },
        { name: "Diamond Greaves", mult: 1.45, cost: 15000 }
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
                mults: { str: 1.0, def: 1.0, spd: 1.0 },
                color: `hsl(${Math.random() * 360}, 70%, 50%)` 
            };
            // Restore Class Bonuses
            if (data.charClass === 'Warrior') { players[socket.id].maxHp += 100; players[socket.id].hp = 200; players[socket.id].str += 5; }
            if (data.charClass === 'Archer') { players[socket.id].spd += 2; }
            if (data.charClass === 'Mage') { players[socket.id].str += 15; }
            db.users[username] = players[socket.id]; saveDB();
        }
        socket.emit('init', { id: socket.id, players, monsters, rooms, portals, GEAR_TIERS });
    });

    socket.on('move', (keys) => {
        const p = players[socket.id]; if (!p || p.hp <= 0) return;
        const moving = keys.w || keys.s || keys.a || keys.d;
        let s = p.spd;
        if (keys.w) p.y -= s; if (keys.s) p.y += s; 
        if (keys.a) p.x -= s; if (keys.d) p.x += s;
        if (p.room === 'track' && moving) p.spd += (0.0008 * p.mults.spd); 
        if (p.room === 'lake' && !moving) p.def += (0.015 * p.mults.def);
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
        if (p.room === 'gym') { p.str += (0.12 * p.mults.str); return; }
        const angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
        projectiles.push({
            ownerId: socket.id, x: p.x, y: p.y,
            vx: Math.cos(angle) * (p.charClass === 'Archer' ? 17 : 12),
            vy: Math.sin(angle) * (p.charClass === 'Archer' ? 17 : 12),
            damage: p.str, room: p.room, range: 75, color: p.color
        });
    });

    socket.on('buyGear', (data) => {
        const p = players[socket.id];
        const tier = GEAR_TIERS[data.type][data.tier];
        if (!p || p.room !== 'shop' || p.gold < tier.cost) return;
        p.gold -= tier.cost;
        p.equips[data.type] = tier.name;
        if (data.type === 'weapon') p.mults.str = tier.mult;
        if (data.type === 'boots') p.mults.spd = tier.mult;
        if (data.type === 'armor') { p.mults.def = tier.mult; p.maxHp = (p.charClass==='Warrior'?200:100) + tier.hp; p.hp = p.maxHp; }
        saveDB();
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => {
    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let prj = projectiles[i]; prj.x += prj.vx; prj.y += prj.vy; prj.range--;
        let hit = false;
        monsters.forEach(m => {
            if (m.room === prj.room && m.isAlive && Math.hypot(prj.x - m.x, prj.y - m.y) < 45) {
                let d = prj.damage; if(m.isBoss) { d *= 0.4; m.lastHit = Date.now(); }
                m.hp -= d; hit = true;
                if (m.hp <= 0) {
                    m.isAlive = false;
                    if(players[prj.ownerId]) players[prj.ownerId].gold += m.isBoss ? 5000 : 150;
                    setTimeout(() => { m.hp = m.maxHp; m.isAlive = true; }, m.isBoss ? 60000 : 8000);
                }
            }
        });
        if (hit || prj.range <= 0) projectiles.splice(i, 1);
    }
    // Monster AI & Boss Regen
    monsters.forEach(m => {
        if (!m.isAlive) return;
        if (m.isBoss && Date.now() - m.lastHit > 5000) m.hp = Math.min(m.maxHp, m.hp + 40);
        let target = null, minDist = 600;
        for (let id in players) {
            let p = players[id]; let d = Math.hypot(m.x - p.x, m.y - p.y);
            if (p.room === m.room && d < minDist) { minDist = d; target = p; }
        }
        if (target) {
            let ang = Math.atan2(target.y - m.y, target.x - m.x);
            m.x += Math.cos(ang) * m.spd; m.y += Math.sin(ang) * m.spd;
            if (minDist < 50 && (!m.lastAtk || Date.now() - m.lastAtk > 1000)) {
                target.hp -= Math.max(5, m.str - (target.def * 0.4)); m.lastAtk = Date.now();
                if (target.hp <= 0) { target.hp = target.maxHp; target.room = 'hub'; target.x = 1000; target.y = 1000; }
            }
        }
    });
    io.emit('update', { players, monsters, projectiles });
}, 30);
server.listen(3000);
