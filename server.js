const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- CONFIGURATION ---
const WORLD_SIZE = 2000;
const TICK_RATE = 30;

const GEAR_DATA = {
    sword: [1.0, 1.3, 1.7, 2.2, 3.5], 
    armor: [1.0, 1.4, 1.8, 2.5, 4.0], 
    boots: [1.0, 1.2, 1.4, 1.7, 2.5]  
};

const PORTALS = [
    { fromRoom: 'hub', toRoom: 'gym', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'GYM' },
    { fromRoom: 'hub', toRoom: 'lake', x: 1900, y: 1000, targetX: 1800, targetY: 1000, color: '#3498db', label: 'LAKE' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#2ecc71', label: 'SHRINE' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#f1c40f', label: 'SHOP' },
    { fromRoom: 'hub', toRoom: 'graveyard', x: 1800, y: 200, targetX: 1000, targetY: 1850, color: '#555', label: 'GRAVEYARD' },
    { fromRoom: 'graveyard', toRoom: 'boss_room', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#ff0000', label: 'BOSS GATE' },
    { fromRoom: 'boss_room', toRoom: 'graveyard', x: 1000, y: 1900, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT' },
    { fromRoom: 'gym', toRoom: 'hub', x: 1900, y: 1000, targetX: 250, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'lake', toRoom: 'hub', x: 1900, y: 1000, targetX: 1750, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shrine', toRoom: 'hub', x: 1000, y: 1900, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 100, targetX: 1000, targetY: 1750, color: '#fff', label: 'EXIT' },
    { fromRoom: 'graveyard', toRoom: 'hub', x: 1000, y: 1950, targetX: 1700, targetY: 350, color: '#fff', label: 'EXIT' }
];

// --- STATE ---
let users = {}; 
let players = {}; 
let projectiles = [];
let monsters = [
    { id: 1, x: 400, y: 400, hp: 250, maxHp: 250, str: 35, gold: 50, room: 'graveyard', isAlive: true, spd: 2.5 },
    { id: 2, x: 1600, y: 1600, hp: 250, maxHp: 250, str: 35, gold: 50, room: 'graveyard', isAlive: true, spd: 2.5 },
    { id: 'BOSS', x: 1000, y: 1000, hp: 8000, maxHp: 8000, str: 150, gold: 2500, room: 'boss_room', isAlive: true, spd: 2.0, isBoss: true }
];

function respawn(p) {
    p.hp = p.maxHp; p.mana = p.maxMana; p.room = 'hub'; p.x = 1000; p.y = 1000;
}

io.on('connection', (socket) => {

    socket.on('register', (data) => {
        if (!users[data.name]) {
            users[data.name] = { 
                password: data.password, charClass: data.charClass,
                str: 10, def: 5, spd: 4, gold: 0, skillPoints: 1,
                upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
                gear: { sword: 0, armor: 0, boots: 0 } 
            };
            socket.emit('authMessage', 'Account Registered.');
        } else socket.emit('authError', 'User already exists.');
    });

    socket.on('login', (data) => {
        const u = users[data.name];
        if (u && u.password === data.password) {
            players[socket.id] = {
                id: socket.id, name: data.name, charClass: u.charClass,
                x: 1000, y: 1000, room: 'hub',
                hp: 100 + (u.charClass === 'Warrior' ? u.upgrades.branchB * 60 : 0),
                maxHp: 100 + (u.charClass === 'Warrior' ? u.upgrades.branchB * 60 : 0),
                mana: 100, maxMana: 100, gold: u.gold,
                str: u.str, def: u.def, spd: u.spd,
                skillPoints: u.skillPoints, upgrades: u.upgrades, gear: u.gear,
                buffs: { str: 1.0 }, cooldowns: { Q: 0, E: 0 },
                keys: {}
            };
            socket.emit('init', { id: socket.id, portals: PORTALS });
        } else socket.emit('authError', 'Login Failed.');
    });

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;
        p.keys = data.keys;

        let speed = p.spd * GEAR_DATA.boots[p.gear.boots];
        if (p.keys.w) p.y -= speed;
        if (p.keys.s) p.y += speed;
        if (p.keys.a) p.x -= speed;
        if (p.keys.d) p.x += speed;

        p.x = Math.max(0, Math.min(p.x, WORLD_SIZE));
        p.y = Math.max(0, Math.min(p.y, WORLD_SIZE));

        PORTALS.forEach(pt => {
            if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                p.room = pt.toRoom; p.x = pt.targetX; p.y = pt.targetY;
            }
        });
    });

    // --- CLICK TO ATTACK LOGIC ---
    socket.on('attack', (targetData) => {
        const p = players[socket.id];
        if (!p || p.room === 'hub' || Date.now() - (p.latk || 0) < 300) return;
        p.latk = Date.now();
        
        let damage = p.str * GEAR_DATA.sword[p.gear.sword] * p.buffs.str;
        
        // Calculate angle from player to click coordinates
        const angle = Math.atan2(targetData.y - p.y, targetData.x - p.x);

        if (p.charClass === 'Warrior') {
            monsters.forEach(m => {
                if (m.isAlive && m.room === p.room && Math.hypot(p.x - m.x, p.y - m.y) < 120) {
                    m.hp -= damage;
                    if (p.upgrades.branchA > 0) p.hp = Math.min(p.maxHp, p.hp + (damage * (p.upgrades.branchA * 0.08)));
                    if (m.hp <= 0) {
                        m.isAlive = false; p.gold += m.gold;
                        if (m.isBoss) p.skillPoints += 5;
                        setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 15000);
                    }
                }
            });
        } else {
            let multishot = (p.charClass === 'Archer' && Math.random() < p.upgrades.branchB * 0.3) ? 2 : 1;
            for (let i = 0; i < multishot; i++) {
                projectiles.push({ 
                    x: p.x, y: p.y, vx: Math.cos(angle + i*0.1)*18, vy: Math.sin(angle + i*0.1)*18, 
                    owner: socket.id, room: p.room, damage: damage, 
                    slow: (p.charClass === 'Mage' ? p.upgrades.branchB * 0.25 : 0) 
                });
            }
        }
    });

    socket.on('useAbility', (data) => {
        const p = players[socket.id];
        if (!p || Date.now() < p.cooldowns[data.key] || p.room === 'hub' || p.upgrades[data.skillId] <= 0) return;

        const angle = Math.atan2(data.targetY - p.y, data.targetX - p.x);

        if (data.skillId === 'start' && p.mana >= 25) {
            let scaling = 2.0 + (p.upgrades.start * 0.8);
            projectiles.push({ x: p.x, y: p.y, vx: Math.cos(angle)*22, vy: Math.sin(angle)*22, owner: socket.id, room: p.room, damage: p.str * scaling, isSpecial: true });
            p.mana -= 25; p.cooldowns[data.key] = Date.now() + 2000;
        } 
        else if (data.skillId === 'ult' && p.mana >= 60) {
            if (p.charClass === 'Warrior') {
                p.buffs.str = 1.8 + (p.upgrades.ult * 0.2);
                setTimeout(() => { if (players[socket.id]) players[socket.id].buffs.str = 1.0; }, 7000);
            } else if (p.charClass === 'Archer') {
                p.x += Math.cos(angle) * (450 + p.upgrades.ult * 50);
                p.y += Math.sin(angle) * (450 + p.upgrades.ult * 50);
            } else if (p.charClass === 'Mage') {
                p.hp = Math.min(p.maxHp, p.hp + 100 + (p.upgrades.ult * 50));
            }
            p.mana -= 60; p.cooldowns[data.key] = Date.now() + 10000;
        }
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p) {
            users[p.name] = { ...users[p.name], str: p.str, def: p.def, spd: p.spd, gold: p.gold, skillPoints: p.skillPoints, upgrades: p.upgrades, gear: p.gear };
            delete players[socket.id];
        }
    });
});

setInterval(() => {
    const now = Date.now();
    Object.values(players).forEach(p => {
        p.mana = Math.min(p.maxMana, p.mana + 0.8 * (p.charClass === 'Mage' ? (1 + p.upgrades.branchA * 0.4) : 1));
        if (p.room === 'gym') p.str += 0.08;
        if (p.room === 'lake' && (p.keys.w || p.keys.a || p.keys.s || p.keys.d)) p.spd += 0.0015;
        if (p.room === 'shrine' && !Object.values(p.keys).some(k => k)) p.def += 0.03;

        monsters.forEach(m => {
            if (!m.isAlive || m.room !== p.room) return;
            let dist = Math.hypot(p.x - m.x, p.y - m.y);
            if (dist < (m.isBoss ? 2000 : 600)) {
                let ang = Math.atan2(p.y - m.y, p.x - m.x);
                m.x += Math.cos(ang) * m.spd; m.y += Math.sin(ang) * m.spd;
                if (dist < 65 && now - (m.latk || 0) > 1000) {
                    p.hp -= Math.max(10, m.str - (p.def * 0.5)); m.latk = now;
                    if (p.hp <= 0) respawn(p);
                }
            }
        });
    });

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let pr = projectiles[i]; pr.x += pr.vx; pr.y += pr.vy;
        monsters.forEach(m => {
            if (m.isAlive && m.room === pr.room && Math.hypot(pr.x - m.x, pr.y - m.y) < 75) {
                m.hp -= pr.damage; projectiles.splice(i, 1);
                if (m.hp <= 0) {
                    m.isAlive = false; 
                    if (players[pr.owner]) players[pr.owner].gold += m.gold;
                    setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 15000);
                }
            }
        });
        if (pr && (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE)) projectiles.splice(i, 1);
    }
    io.emit('update', { players, monsters, projectiles });
}, TICK_RATE);

http.listen(3000, () => console.log('Server running on 3000'));
