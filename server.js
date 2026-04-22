const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const WORLD_SIZE = 2000;

// --- PERSISTENT USER DATA (Simulated Database) ---
const users = {}; 

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
    graveyard: { name: "Graveyard (Level 1)", bg: "#1a1a1a" },
    caves: { name: "Deep Caves (Level 2)", bg: "#0d0d1a" },
    void: { name: "The Void (Level 3)", bg: "#0a000a" },
    lair: { name: "Boss Lair", bg: "#2a0033" }
};

// --- THE LINEAR PORTAL SYSTEM ---
const portals = [
    // VILLAGE -> SHOP & LEVEL 1
    { fromRoom: 'hub', toRoom: 'shop', x: 1800, y: 200, targetX: 1000, targetY: 1800, color: '#f1c40f', label: 'Blacksmith' },
    { fromRoom: 'hub', toRoom: 'graveyard', x: 1000, y: 100, targetX: 1000, targetY: 1850, color: '#555', label: 'ENTER DUNGEON' },
    
    // LEVEL 1 (Graveyard) -> HUB or LEVEL 2
    { fromRoom: 'graveyard', toRoom: 'hub', x: 1000, y: 1950, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT TO VILLAGE' },
    { fromRoom: 'graveyard', toRoom: 'caves', x: 1000, y: 50, targetX: 1000, targetY: 1850, color: '#3498db', label: 'DEEPER (Level 2)' },

    // LEVEL 2 (Caves) -> LEVEL 1 or LEVEL 3
    { fromRoom: 'caves', toRoom: 'graveyard', x: 1000, y: 1950, targetX: 1000, targetY: 200, color: '#fff', label: 'UP (Level 1)' },
    { fromRoom: 'caves', toRoom: 'void', x: 1000, y: 50, targetX: 1000, targetY: 1850, color: '#9b59b6', label: 'DEEPER (Level 3)' },

    // LEVEL 3 (Void) -> LEVEL 2 or BOSS
    { fromRoom: 'void', toRoom: 'caves', x: 1000, y: 1950, targetX: 1000, targetY: 200, color: '#fff', label: 'UP (Level 2)' },
    { fromRoom: 'void', toRoom: 'lair', x: 1900, y: 1000, targetX: 200, targetY: 1000, color: '#ff0000', label: 'BOSS ENTRANCE' },

    // SHOP & BOSS ESCAPE
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 1950, targetX: 1800, targetY: 350, color: '#fff', label: 'EXIT' },
    { fromRoom: 'lair', toRoom: 'hub', x: 100, y: 1000, targetX: 1000, targetY: 1000, color: '#fff', label: 'ESCAPE' }
];

let players = {};
let projectiles = [];
let monsters = [
    { id: 1, x: 500, y: 500, hp: 100, maxHp: 100, str: 10, gold: 25, room: 'graveyard', isAlive: true, spd: 1.5 },
    { id: 2, x: 1500, y: 800, hp: 100, maxHp: 100, str: 10, gold: 25, room: 'graveyard', isAlive: true, spd: 1.5 },
    { id: 10, x: 800, y: 300, hp: 500, maxHp: 500, str: 40, gold: 150, room: 'caves', isAlive: true, spd: 2.5 },
    { id: 11, x: 1200, y: 1400, hp: 500, maxHp: 500, str: 40, gold: 150, room: 'caves', isAlive: true, spd: 2.5 },
    { id: 20, x: 1000, y: 500, hp: 2500, maxHp: 2500, str: 120, gold: 800, room: 'void', isAlive: true, spd: 3.2 },
    { id: 21, x: 500, y: 1500, hp: 2500, maxHp: 2500, str: 120, gold: 800, room: 'void', isAlive: true, spd: 3.2 },
    { id: 999, x: 1000, y: 1000, hp: 15000, maxHp: 15000, str: 250, gold: 10000, room: 'lair', isAlive: true, spd: 1.5, isBoss: true }
];

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        if (users[data.name]) return socket.emit('authError', 'User already exists!');
        users[data.name] = {
            password: data.password,
            charClass: data.charClass,
            gold: 0,
            equips: { weapon: "Rusty Sword", armor: "Rags", boots: "Old Boots" }
        };
        socket.emit('authSuccess', 'Account created! Now login.');
    });

    socket.on('login', (data) => {
        const user = users[data.name];
        if (!user || user.password !== data.password) return socket.emit('authError', 'Invalid credentials!');
        
        for(let id in players) if(players[id].name === data.name) return socket.emit('authError', 'User already logged in!');

        players[socket.id] = {
            id: socket.id,
            name: data.name,
            charClass: user.charClass,
            x: 1000, y: 1000,
            hp: 100, maxHp: 100, energy: 100, 
            gold: user.gold, 
            str: 10, def: 5, spd: 4, room: 'hub',
            equips: user.equips,
            mults: { str: 1.0, def: 1.0, spd: 1.0 },
            cooldowns: { Q: 0, E: 0 },
            lastClick: 0,
            angle: 0,
            color: user.charClass === 'Warrior' ? '#e67e22' : (user.charClass === 'Archer' ? '#2ecc71' : '#9b59b6')
        };
        
        socket.emit('init', { id: socket.id, rooms, portals, GEAR_TIERS });
    });

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;
        let fs = p.spd * p.mults.spd;
        if (data.keys.w) p.y -= fs;
        if (data.keys.s) p.y += fs;
        if (data.keys.a) p.x -= fs;
        if (data.keys.d) p.x += fs;
        
        p.x = Math.max(0, Math.min(p.x, WORLD_SIZE));
        p.y = Math.max(0, Math.min(p.y, WORLD_SIZE));
        p.angle = data.angle;

        // Portal Detection Logic
        portals.forEach(pt => {
            if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 80) {
                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
            }
        });
    });

    socket.on('useAbility', (key) => {
        const p = players[socket.id];
        if (!p || Date.now() < p.cooldowns[key]) return;

        if (key === 'Q' && p.energy >= 20) {
            let pSpd = 12, pDmg = p.str * p.mults.str, isSpec = false;
            if (p.charClass === 'Warrior') { pDmg += 30; p.cooldowns.Q = Date.now() + 3000; }
            else if (p.charClass === 'Archer') { pSpd = 18; p.cooldowns.Q = Date.now() + 1000; }
            else if (p.charClass === 'Mage') { pDmg += 80; isSpec = true; p.cooldowns.Q = Date.now() + 4000; }
            
            projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.angle)*pSpd, vy: Math.sin(p.angle)*pSpd, owner: socket.id, room: p.room, damage: pDmg, color: p.color, isSpecial: isSpec });
            p.energy -= 20;
        } else if (key === 'E' && p.energy >= 40) {
            if (p.charClass === 'Warrior') {
                p.mults.str = 1.8;
                setTimeout(() => { if (players[socket.id]) players[socket.id].mults.str = 1.0; }, 5000);
                p.cooldowns.E = Date.now() + 10000;
            } else if (p.charClass === 'Archer') {
                p.x += Math.cos(p.angle)*150; p.y += Math.sin(p.angle)*150;
                p.cooldowns.E = Date.now() + 4000;
            } else if (p.charClass === 'Mage') {
                p.hp = Math.min(p.maxHp, p.hp + 60);
                p.cooldowns.E = Date.now() + 8000;
            }
            p.energy -= 40;
        }
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p) return;
        const now = Date.now();
        if (now - p.lastClick < 250) return; // CLICK LIMITER
        p.lastClick = now;

        projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.angle)*12, vy: Math.sin(p.angle)*12, owner: socket.id, room: p.room, damage: p.str*p.mults.str, color: p.color });
    });

    socket.on('buyGear', (data) => {
        const p = players[socket.id];
        if (!p || p.room !== 'shop') return;
        const t = GEAR_TIERS[data.type][data.tier];
        if (p.gold >= t.cost) {
            p.gold -= t.cost;
            p.equips[data.type] = t.name;
            if (data.type === 'weapon') p.str = 10 + t.str;
            if (data.type === 'armor') p.def = 5 + t.def;
            if (data.type === 'boots') p.spd = 4 + t.spd;
            users[p.name].gold = p.gold;
            users[p.name].equips = p.equips;
        }
    });

    socket.on('chat', (msg) => {
        const p = players[socket.id];
        if (p) io.emit('msg', `${p.name}: ${msg}`);
    });

    socket.on('disconnect', () => {
        if(players[socket.id]) {
            const p = players[socket.id];
            users[p.name].gold = p.gold;
            users[p.name].equips = p.equips;
            delete players[socket.id];
        }
    });
});

setInterval(() => {
    // Projectile Loop
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let pr = projectiles[i];
        pr.x += pr.vx; pr.y += pr.vy;
        if (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE) { projectiles.splice(i, 1); continue; }
        
        monsters.forEach(m => {
            if (m.isAlive && m.room === pr.room && Math.hypot(pr.x - m.x, pr.y - m.y) < 40) {
                m.hp -= pr.damage;
                projectiles.splice(i, 1);
                if (m.hp <= 0) {
                    m.isAlive = false;
                    if (players[pr.owner]) players[pr.owner].gold += m.gold;
                    setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 10000);
                }
            }
        });
    }

    // Player/Monster Logic
    Object.values(players).forEach(p => {
        p.energy = Math.min(100, p.energy + 0.5);
        monsters.forEach(m => {
            if (m.isAlive && m.room === p.room) {
                let d = Math.hypot(p.x - m.x, p.y - m.y);
                if (d < 400) {
                    let a = Math.atan2(p.y - m.y, p.x - m.x);
                    m.x += Math.cos(a) * m.spd; m.y += Math.sin(a) * m.spd;
                    if (d < 50 && (!m.lastAtk || Date.now() - m.lastAtk > 1000)) {
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

http.listen(3000, () => console.log('Server Live on 3000'));
