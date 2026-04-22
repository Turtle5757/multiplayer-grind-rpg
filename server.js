const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- CONSTANTS & GEAR ---
const WORLD_SIZE = 2000;
const GEAR_TIERS = {
    weapon: [
        { name: "Rusty Sword", cost: 0, str: 5 },
        { name: "Steel Blade", cost: 500, str: 25 },
        { name: "Dragon Slayer", cost: 5000, str: 100 }
    ],
    armor: [
        { name: "Rags", cost: 0, def: 2 },
        { name: "Iron Plate", cost: 800, def: 30 },
        { name: "Diamond Plate", cost: 6000, def: 150 }
    ],
    boots: [
        { name: "Old Boots", cost: 0, spd: 0.2 },
        { name: "Leather Boots", cost: 400, spd: 1.5 },
        { name: "Winged Boots", cost: 3000, spd: 4.0 }
    ]
};

const rooms = {
    hub: { name: "Village", bg: "#15220d" },
    shop: { name: "Blacksmith", bg: "#2c3e50" },
    graveyard: { name: "Graveyard (Lv. 1-10)", bg: "#1a1a1a" },
    caves: { name: "Deep Caves (Lv. 10-25)", bg: "#0d0d1a" },
    void: { name: "The Void (Lv. 25+)", bg: "#0a000a" },
    lair: { name: "Boss Lair", bg: "#2a0033" }
};

const portals = [
    { fromRoom: 'hub', toRoom: 'shop', x: 1700, y: 300, targetX: 1000, targetY: 1800, color: '#f1c40f', label: 'Blacksmith' },
    { fromRoom: 'hub', toRoom: 'graveyard', x: 1900, y: 1000, targetX: 200, targetY: 1000, color: '#555', label: 'Graveyard (Easy)' },
    { fromRoom: 'hub', toRoom: 'caves', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#3498db', label: 'Caves (Medium)' },
    { fromRoom: 'hub', toRoom: 'void', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#9b59b6', label: 'The Void (Hard)' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 1950, targetX: 1700, targetY: 400, color: '#fff', label: 'Village' },
    { fromRoom: 'graveyard', toRoom: 'hub', x: 100, y: 1000, targetX: 1750, targetY: 1000, color: '#fff', label: 'Village' },
    { fromRoom: 'caves', toRoom: 'hub', x: 1000, y: 1950, targetX: 1000, targetY: 300, color: '#fff', label: 'Village' },
    { fromRoom: 'void', toRoom: 'hub', x: 1000, y: 50, targetX: 1000, targetY: 1700, color: '#fff', label: 'Village' },
    { fromRoom: 'void', toRoom: 'lair', x: 1900, y: 1000, targetX: 200, targetY: 1000, color: '#ff0000', label: 'BOSS ENTRANCE' },
    { fromRoom: 'lair', toRoom: 'hub', x: 100, y: 1000, targetX: 1000, targetY: 1000, color: '#fff', label: 'Escape' }
];

let players = {};
let monsters = [
    { id: 1, x: 500, y: 500, hp: 100, maxHp: 100, str: 10, gold: 25, room: 'graveyard', isAlive: true, spd: 1.5 },
    { id: 2, x: 1500, y: 800, hp: 100, maxHp: 100, str: 10, gold: 25, room: 'graveyard', isAlive: true, spd: 1.5 },
    { id: 10, x: 800, y: 300, hp: 500, maxHp: 500, str: 40, gold: 150, room: 'caves', isAlive: true, spd: 2.5 },
    { id: 11, x: 1200, y: 1400, hp: 500, maxHp: 500, str: 40, gold: 150, room: 'caves', isAlive: true, spd: 2.5 },
    { id: 20, x: 1000, y: 500, hp: 2500, maxHp: 2500, str: 120, gold: 800, room: 'void', isAlive: true, spd: 3.2 },
    { id: 21, x: 500, y: 1500, hp: 2500, maxHp: 2500, str: 120, gold: 800, room: 'void', isAlive: true, spd: 3.2 },
    { id: 999, x: 1000, y: 1000, hp: 15000, maxHp: 15000, str: 250, gold: 10000, room: 'lair', isAlive: true, spd: 1.5, isBoss: true }
];
let projectiles = [];

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        players[socket.id] = {
            id: socket.id, name: data.name, charClass: data.charClass,
            x: 1000, y: 1000, hp: 100, maxHp: 100, energy: 100, gold: 0,
            str: 10, def: 5, spd: 4, room: 'hub',
            equips: { weapon: "Rusty Sword", armor: "Rags", boots: "Old Boots" },
            mults: { str: 1.0, def: 1.0, spd: 1.0 },
            cooldowns: { Q: 0, E: 0 },
            color: data.charClass === 'Warrior' ? '#e67e22' : (data.charClass === 'Archer' ? '#2ecc71' : '#9b59b6')
        };
        socket.emit('init', { id: socket.id, rooms, portals, GEAR_TIERS });
    });

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;
        let speed = p.spd * p.mults.spd;
        if (data.keys.w) p.y -= speed;
        if (data.keys.s) p.y += speed;
        if (data.keys.a) p.x -= speed;
        if (data.keys.d) p.x += speed;
        p.x = Math.max(0, Math.min(p.x, WORLD_SIZE));
        p.y = Math.max(0, Math.min(p.y, WORLD_SIZE));
        p.angle = data.angle;

        portals.forEach(pt => {
            if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                p.room = pt.toRoom; p.x = pt.targetX; p.y = pt.targetY;
            }
        });
    });

    socket.on('useAbility', (key) => {
        const p = players[socket.id];
        if (!p || Date.now() < p.cooldowns[key] || p.energy < 20) return;

        if (key === 'Q') {
            let pSpd = 12, pDmg = p.str, pSize = 8;
            if (p.charClass === 'Warrior') { pDmg += 30; p.cooldowns.Q = Date.now() + 3000; }
            if (p.charClass === 'Archer') { pSpd = 18; p.cooldowns.Q = Date.now() + 1000; }
            if (p.charClass === 'Mage') { pDmg += 80; pSize = 12; p.cooldowns.Q = Date.now() + 4000; }
            
            projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.angle) * pSpd, vy: Math.sin(p.angle) * pSpd, owner: socket.id, room: p.room, damage: pDmg, color: p.color, isSpecial: (p.charClass === 'Mage') });
            p.energy -= 20;
        } else if (key === 'E') {
            if (p.charClass === 'Warrior') { 
                p.mults.str = 1.8; 
                setTimeout(() => p.mults.str = 1.0, 5000); 
                p.cooldowns.E = Date.now() + 10000;
            }
            if (p.charClass === 'Archer') { 
                p.x += Math.cos(p.angle) * 150; p.y += Math.sin(p.angle) * 150; 
                p.cooldowns.E = Date.now() + 4000;
            }
            if (p.charClass === 'Mage') { 
                p.hp = Math.min(p.maxHp, p.hp + 60); 
                p.cooldowns.E = Date.now() + 8000;
            }
            p.energy -= 40;
        }
    });

    socket.on('buyGear', (data) => {
        const p = players[socket.id];
        if (!p || p.room !== 'shop') return;
        const item = GEAR_TIERS[data.type][data.tier];
        if (p.gold >= item.cost) {
            p.gold -= item.cost;
            p.equips[data.type] = item.name;
            if (data.type === 'weapon') p.str = 10 + item.str;
            if (data.type === 'armor') p.def = 5 + item.def;
            if (data.type === 'boots') p.spd = 4 + item.spd;
        }
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p) return;
        projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.angle) * 12, vy: Math.sin(p.angle) * 12, owner: socket.id, room: p.room, damage: p.str, color: p.color });
    });

    socket.on('chat', (msg) => {
        const p = players[socket.id];
        if (p) io.emit('msg', `${p.name}: ${msg}`);
    });

    socket.on('disconnect', () => delete players[socket.id]);
});

setInterval(() => {
    projectiles.forEach((proj, i) => {
        proj.x += proj.vx; proj.y += proj.vy;
        if (proj.x < 0 || proj.x > WORLD_SIZE || proj.y < 0 || proj.y > WORLD_SIZE) projectiles.splice(i, 1);
        
        monsters.forEach(m => {
            if (m.isAlive && m.room === proj.room && Math.hypot(proj.x - m.x, proj.y - m.y) < 40) {
                m.hp -= proj.damage;
                projectiles.splice(i, 1);
                if (m.hp <= 0) {
                    m.isAlive = false;
                    if (players[proj.owner]) players[proj.owner].gold += m.gold;
                    setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 10000);
                }
            }
        });
    });

    Object.values(players).forEach(p => {
        p.energy = Math.min(100, p.energy + 0.5);
        monsters.forEach(m => {
            if (m.isAlive && m.room === p.room) {
                let dist = Math.hypot(p.x - m.x, p.y - m.y);
                if (dist < 400) {
                    let ang = Math.atan2(p.y - m.y, p.x - m.x);
                    m.x += Math.cos(ang) * m.spd; m.y += Math.sin(ang) * m.spd;
                    if (dist < 50 && (!m.lastAtk || Date.now() - m.lastAtk > 1000)) {
                        p.hp -= Math.max(2, m.str - (p.def * 0.5));
                        m.lastAtk = Date.now();
                        if (p.hp <= 0) {
                            p.hp = p.maxHp; p.room = 'hub'; p.x = 1000; p.y = 1000;
                            p.gold = Math.floor(p.gold * 0.9);
                        }
                    }
                }
            }
        });
    });
    io.emit('update', { players, monsters, projectiles });
}, 30);

http.listen(3000, () => console.log('Server running on 3000'));
