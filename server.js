const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const WORLD_SIZE = 2000;
const users = {}; // Persistent stat storage for session

// --- ROOMS & PORTALS ---
const rooms = {
    hub: { name: "Village", bg: "#15220d" },
    gym: { name: "The Gym (STR)", bg: "#3d2b1f" },
    lake: { name: "Swift Lake (SPD)", bg: "#1a3a4a" },
    shrine: { name: "Meditation Shrine (DEF)", bg: "#1b2e2b" },
    shop: { name: "Blacksmith", bg: "#2c3e50" },
    graveyard: { name: "Graveyard", bg: "#1a1a1a" }
};

const PORTALS = [
    { fromRoom: 'hub', toRoom: 'gym', x: 200, y: 500, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'GYM' },
    { fromRoom: 'hub', toRoom: 'lake', x: 200, y: 1000, targetX: 1800, targetY: 1000, color: '#3498db', label: 'LAKE' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 200, y: 1500, targetX: 1800, targetY: 1000, color: '#2ecc71', label: 'SHRINE' },
    { fromRoom: 'gym', toRoom: 'hub', x: 1900, y: 1000, targetX: 350, targetY: 500, color: '#fff', label: 'EXIT' },
    { fromRoom: 'lake', toRoom: 'hub', x: 1900, y: 1000, targetX: 350, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shrine', toRoom: 'hub', x: 1900, y: 1000, targetX: 350, targetY: 1500, color: '#fff', label: 'EXIT' }
];

let players = {};
let projectiles = [];
let monsters = [
    { id: 1, x: 500, y: 500, hp: 100, maxHp: 100, str: 10, gold: 30, room: 'graveyard', isAlive: true, spd: 1.5 }
];

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const username = data.name || "Hero";
        // Persistence: Load existing user or create new
        if (!users[username]) {
            users[username] = { str: 10, def: 5, spd: 4, gold: 0, charClass: data.charClass || 'Warrior' };
        }
        
        const u = users[username];
        players[socket.id] = {
            id: socket.id,
            name: username,
            charClass: u.charClass,
            x: 1000, y: 1000,
            hp: 100, maxHp: 100, energy: 100, room: 'hub',
            str: u.str, def: u.def, spd: u.spd, gold: u.gold,
            mults: { str: 1.0, def: 1.0, spd: 1.0 }, // Item multipliers
            buffs: { str: 1.0 }, // Temporary ability buffs
            cooldowns: { Q: 0, E: 0 },
            keys: { w: false, a: false, s: false, d: false },
            angle: 0,
            color: u.charClass === 'Warrior' ? '#e67e22' : (u.charClass === 'Archer' ? '#2ecc71' : '#9b59b6')
        };
        socket.emit('init', { id: socket.id, rooms, portals: PORTALS });
    });

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;
        p.keys = data.keys;
        p.angle = data.angle;

        let baseSpd = p.spd * p.mults.spd;
        if (data.keys.w) p.y -= baseSpd;
        if (data.keys.s) p.y += baseSpd;
        if (data.keys.a) p.x -= baseSpd;
        if (data.keys.d) p.x += baseSpd;

        p.x = Math.max(0, Math.min(p.x, WORLD_SIZE));
        p.y = Math.max(0, Math.min(p.y, WORLD_SIZE));

        PORTALS.forEach(pt => {
            if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 80) {
                p.room = pt.toRoom; p.x = pt.targetX; p.y = pt.targetY;
            }
        });
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p) return;

        // --- STRENGTH TRAINING ---
        if (p.room === 'gym') p.str += 0.25;

        if (Date.now() - (p.lastAtk || 0) < 350) return;
        p.lastAtk = Date.now();
        
        projectiles.push({ 
            x: p.x, y: p.y, vx: Math.cos(p.angle) * 16, vy: Math.sin(p.angle) * 16, 
            owner: socket.id, room: p.room, damage: p.str * p.mults.str * p.buffs.str 
        });
    });

    socket.on('useAbility', (key) => {
        const p = players[socket.id];
        if (!p || Date.now() < p.cooldowns[key]) return;

        if (key === 'Q' && p.energy >= 20) {
            projectiles.push({ 
                x: p.x, y: p.y, vx: Math.cos(p.angle) * 22, vy: Math.sin(p.angle) * 22, 
                owner: socket.id, room: p.room, damage: p.str * 2, isSpecial: true 
            });
            p.energy -= 20; p.cooldowns.Q = Date.now() + 2000;
        } 
        else if (key === 'E' && p.energy >= 40) {
            if (p.charClass === 'Warrior') {
                p.buffs.str = 1.6;
                setTimeout(() => { if(players[socket.id]) players[socket.id].buffs.str = 1.0; }, 5000);
            } else if (p.charClass === 'Archer') {
                p.x += Math.cos(p.angle) * 280; p.y += Math.sin(p.angle) * 280;
            } else if (p.charClass === 'Mage') {
                p.hp = Math.min(p.maxHp, p.hp + 50);
            }
            p.energy -= 40; p.cooldowns.E = Date.now() + 8000;
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const p = players[socket.id];
            users[p.name] = { str: p.str, def: p.def, spd: p.spd, gold: p.gold, charClass: p.charClass };
            delete players[socket.id];
        }
    });
});

setInterval(() => {
    Object.values(players).forEach(p => {
        p.energy = Math.min(100, p.energy + 0.5);
        const moving = p.keys.w || p.keys.a || p.keys.s || p.keys.d;
        
        // --- SPEED & DEFENSE TRAINING ---
        if (p.room === 'lake' && moving) p.spd += 0.006;
        if (p.room === 'shrine' && !moving) p.def += 0.1;

        monsters.forEach(m => {
            if (m.isAlive && m.room === p.room) {
                let dist = Math.hypot(p.x - m.x, p.y - m.y);
                if (dist < 450) {
                    let ang = Math.atan2(p.y - m.y, p.x - m.x);
                    m.x += Math.cos(ang) * m.spd; m.y += Math.sin(ang) * m.spd;
                    if (dist < 50 && Date.now() - (m.lastAtk || 0) > 1000) {
                        p.hp -= Math.max(1, m.str - (p.def * 0.45));
                        m.lastAtk = Date.now();
                        if (p.hp <= 0) { p.hp = 100; p.room = 'hub'; p.x = 1000; p.y = 1000; }
                    }
                }
            }
        });
    });

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let pr = projectiles[i]; pr.x += pr.vx; pr.y += pr.vy;
        monsters.forEach(m => {
            if (m.isAlive && m.room === pr.room && Math.hypot(pr.x - m.x, pr.y - m.y) < 50) {
                m.hp -= pr.damage; projectiles.splice(i, 1);
                if (m.hp <= 0) {
                    m.isAlive = false;
                    if(players[pr.owner]) players[pr.owner].gold += m.gold;
                    setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 5000);
                }
            }
        });
        if (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE) projectiles.splice(i, 1);
    }
    io.emit('update', { players, monsters, projectiles });
}, 30);

http.listen(3000, () => console.log('Server Live'));
