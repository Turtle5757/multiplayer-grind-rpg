const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const WORLD_SIZE = 2000;
const users = {}; // Stores persistent data like gold/equips

// --- GAME CONSTANTS ---
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
    gym: { name: "The Gym (STR)", bg: "#3d2b1f" },
    lake: { name: "Swift Lake (SPD)", bg: "#1a3a4a" },
    shrine: { name: "Meditation Shrine (DEF)", bg: "#1b2e2b" },
    shop: { name: "Blacksmith", bg: "#2c3e50" },
    graveyard: { name: "Graveyard (Level 1)", bg: "#1a1a1a" },
    caves: { name: "Deep Caves (Level 2)", bg: "#0d0d1a" },
    void: { name: "The Void (Level 3)", bg: "#0a000a" },
    lair: { name: "Boss Lair", bg: "#2a0033" }
};

const PORTALS = [
    // Hub to Training Areas
    { fromRoom: 'hub', toRoom: 'gym', x: 200, y: 500, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'GYM (STR)' },
    { fromRoom: 'hub', toRoom: 'lake', x: 200, y: 1000, targetX: 1800, targetY: 1000, color: '#3498db', label: 'LAKE (SPD)' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 200, y: 1500, targetX: 1800, targetY: 1000, color: '#2ecc71', label: 'SHRINE (DEF)' },

    // Hub to Shop/Dungeon
    { fromRoom: 'hub', toRoom: 'shop', x: 1800, y: 200, targetX: 1000, targetY: 1800, color: '#f1c40f', label: 'BLACKSMITH' },
    { fromRoom: 'hub', toRoom: 'graveyard', x: 1000, y: 100, targetX: 1000, targetY: 1850, color: '#555', label: 'ENTER DUNGEON' },
    
    // Return to Hub Portals
    { fromRoom: 'gym', toRoom: 'hub', x: 1900, y: 1000, targetX: 350, targetY: 500, color: '#fff', label: 'EXIT' },
    { fromRoom: 'lake', toRoom: 'hub', x: 1900, y: 1000, targetX: 350, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shrine', toRoom: 'hub', x: 1900, y: 1000, targetX: 350, targetY: 1500, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 1950, targetX: 1800, targetY: 350, color: '#fff', label: 'EXIT' },

    // Dungeon Progression
    { fromRoom: 'graveyard', toRoom: 'hub', x: 1000, y: 1950, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT' },
    { fromRoom: 'graveyard', toRoom: 'caves', x: 1000, y: 50, targetX: 1000, targetY: 1850, color: '#3498db', label: 'LEVEL 2' },
    { fromRoom: 'caves', toRoom: 'void', x: 1000, y: 50, targetX: 1000, targetY: 1850, color: '#9b59b6', label: 'LEVEL 3' },
    { fromRoom: 'void', toRoom: 'lair', x: 1900, y: 1000, targetX: 200, targetY: 1000, color: '#ff0000', label: 'BOSS' }
];

let players = {};
let projectiles = [];
let monsters = [
    { id: 1, x: 500, y: 500, hp: 100, maxHp: 100, str: 10, gold: 30, room: 'graveyard', isAlive: true, spd: 1.5 },
    { id: 2, x: 1500, y: 1500, hp: 100, maxHp: 100, str: 10, gold: 30, room: 'graveyard', isAlive: true, spd: 1.5 },
    { id: 10, x: 1000, y: 1000, hp: 600, maxHp: 600, str: 45, gold: 150, room: 'caves', isAlive: true, spd: 2.2 },
    { id: 999, x: 1000, y: 1000, hp: 20000, maxHp: 20000, str: 300, gold: 10000, room: 'lair', isAlive: true, spd: 1.2, isBoss: true }
];

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        if (users[data.name]) return socket.emit('authError', 'User already exists');
        users[data.name] = { 
            password: data.password, 
            charClass: data.charClass, 
            gold: 0, 
            str: 10, def: 5, spd: 4,
            equips: { weapon: "Rusty Sword", armor: "Rags", boots: "Old Boots" } 
        };
        socket.emit('authSuccess', 'Registered!');
    });

    socket.on('login', (data) => {
        const u = users[data.name];
        if (!u || u.password !== data.password) return socket.emit('authError', 'Login Failed');
        
        players[socket.id] = {
            id: socket.id, name: data.name, charClass: u.charClass, x: 1000, y: 1000,
            hp: 100, maxHp: 100, energy: 100, gold: u.gold, room: 'hub',
            str: u.str, def: u.def, spd: u.spd,
            equips: u.equips,
            mults: { str: 1.0, def: 1.0, spd: 1.0 },
            cooldowns: { Q: 0, E: 0 },
            angle: 0,
            color: u.charClass === 'Warrior' ? '#e67e22' : (u.charClass === 'Archer' ? '#2ecc71' : '#9b59b6')
        };
        socket.emit('init', { id: socket.id, rooms, portals: PORTALS, GEAR_TIERS });
    });

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;
        let finalSpd = p.spd * p.mults.spd;
        if (data.keys.w) p.y -= finalSpd;
        if (data.keys.s) p.y += finalSpd;
        if (data.keys.a) p.x -= finalSpd;
        if (data.keys.d) p.x += finalSpd;

        p.x = Math.max(0, Math.min(p.x, WORLD_SIZE));
        p.y = Math.max(0, Math.min(p.y, WORLD_SIZE));
        p.angle = data.angle;

        PORTALS.forEach(pt => {
            if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 80) {
                p.room = pt.toRoom; p.x = pt.targetX; p.y = pt.targetY;
            }
        });
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p || Date.now() - (p.lastAtk || 0) < 350) return;
        p.lastAtk = Date.now();
        projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.angle)*16, vy: Math.sin(p.angle)*16, owner: socket.id, room: p.room, damage: p.str * p.mults.str, color: p.color });
    });

    socket.on('useAbility', (key) => {
        const p = players[socket.id];
        if (!p || Date.now() < p.cooldowns[key]) return;
        if (key === 'Q' && p.energy >= 20) {
            projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.angle)*22, vy: Math.sin(p.angle)*22, owner: socket.id, room: p.room, damage: p.str * 2, color: "white", isSpecial: true });
            p.energy -= 20; p.cooldowns.Q = Date.now() + 2000;
        } else if (key === 'E' && p.energy >= 50) {
            p.mults.str = 1.5; 
            setTimeout(() => { if(players[socket.id]) players[socket.id].mults.str = 1.0; }, 5000);
            p.energy -= 50; p.cooldowns.E = Date.now() + 10000;
        }
    });

    socket.on('buyGear', (data) => {
        const p = players[socket.id];
        if (!p || p.room !== 'shop') return;
        const item = GEAR_TIERS[data.type][data.tier];
        if (p.gold >= item.cost) {
            p.gold -= item.cost; p.equips[data.type] = item.name;
            if (data.type === 'weapon') p.str += item.str;
            if (data.type === 'armor') p.def += item.def;
            if (data.type === 'boots') p.spd += item.spd;
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const p = players[socket.id];
            users[p.name].gold = p.gold;
            users[p.name].str = p.str;
            users[p.name].def = p.def;
            users[p.name].spd = p.spd;
            delete players[socket.id];
        }
    });
});

// --- MAIN LOOP (30 FPS) ---
setInterval(() => {
    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let pr = projectiles[i];
        pr.x += pr.vx; pr.y += pr.vy;
        monsters.forEach(m => {
            if (m.isAlive && m.room === pr.room && Math.hypot(pr.x - m.x, pr.y - m.y) < 50) {
                m.hp -= pr.damage; projectiles.splice(i, 1);
                if (m.hp <= 0) {
                    m.isAlive = false;
                    if (players[pr.owner]) players[pr.owner].gold += m.gold;
                    setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 5000);
                }
            }
        });
        if (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE) projectiles.splice(i, 1);
    }

    // Players & Training
    Object.values(players).forEach(p => {
        p.energy = Math.min(100, p.energy + 0.4);
        
        // --- TRAINING MECHANIC ---
        if (p.room === 'gym') p.str += 0.05;    // Incremental STR gain
        if (p.room === 'shrine') p.def += 0.05; // Incremental DEF gain
        if (p.room === 'lake') p.spd += 0.01;   // Incremental SPD gain

        // Monster AI
        monsters.forEach(m => {
            if (m.isAlive && m.room === p.room) {
                let dist = Math.hypot(p.x - m.x, p.y - m.y);
                if (dist < 450) {
                    let ang = Math.atan2(p.y - m.y, p.x - m.x);
                    m.x += Math.cos(ang) * m.spd; m.y += Math.sin(ang) * m.spd;
                    if (dist < 50 && Date.now() - (m.lastAtk || 0) > 1000) {
                        p.hp -= Math.max(1, m.str - (p.def * 0.4));
                        m.lastAtk = Date.now();
                        if (p.hp <= 0) { p.hp = 100; p.room = 'hub'; p.x = 1000; p.y = 1000; p.gold = Math.floor(p.gold * 0.8); }
                    }
                }
            }
        });
    });

    io.emit('update', { players, monsters, projectiles });
}, 30);

http.listen(3000, () => console.log('Server Active on 3000'));
