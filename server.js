const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- CONFIGURATION ---
const WORLD_SIZE = 2000;
const TICK_RATE = 30;

const GEAR_DATA = {
    sword: [1.0, 1.3, 1.7, 2.2, 3.5], // STR multipliers
    armor: [1.0, 1.4, 1.8, 2.5, 4.0], // DEF multipliers
    boots: [1.0, 1.2, 1.4, 1.7, 2.5]  // SPD multipliers
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

// --- NETWORK ---
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
                keys: {}, angle: 0
            };
            socket.emit('init', { id: socket.id, portals: PORTALS });
        } else socket.emit('authError', 'Login Failed.');
    });

    socket.on('upgradeSkill', (branch) => {
        const p = players[socket.id];
        if (!p || p.skillPoints <= 0) return;
        if (p.upgrades[branch] < 3) {
            p.upgrades[branch]++;
            p.skillPoints--;
            if (p.charClass === 'Warrior' && branch === 'branchB') { p.maxHp += 60; p.hp += 60; }
        }
    });

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;
        p.keys = data.keys;
        p.angle = data.angle;

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

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p || p.room === 'hub' || Date.now() - (p.latk || 0) < 300) return;
        p.latk = Date.now();
        
        let damage = p.str * GEAR_DATA.sword[p.gear.sword] * p.buffs.str;

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
            socket.emit('swingEffect');
        } else {
            let multishot = (p.charClass === 'Archer' && Math.random() < p.upgrades.branchB * 0.3) ? 2 : 1;
            for (let i = 0; i < multishot; i++) {
                projectiles.push({ 
                    x: p.x, y: p.y, vx: Math.cos(p.angle + i*0.1)*20, vy: Math.sin(p.angle + i*0.1)*20, 
                    owner: socket.id, room: p.room, damage: damage, 
                    slow: (p.charClass === 'Mage' ? p.upgrades.branchB * 0.25 : 0) 
                });
            }
        }
    });

    socket.on('useAbility', (data) => {
        const p = players[socket.id];
        const { key, skillId } = data;
        if (!p || Date.now() < p.cooldowns[key] || p.room === 'hub' || p.upgrades[skillId] <= 0) return;

        if (skillId === 'start' && p.mana >= 25) {
            let scaling = 2.0 + (p.upgrades.start * 0.8);
            projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.angle)*25, vy: Math.sin(p.angle)*25, owner: socket.id, room: p.room, damage: p.str * scaling, isSpecial: true });
            p.mana -= 25; p.cooldowns[key] = Date.now() + 2000;
        } 
        else if (skillId === 'ult' && p.mana >= 60) {
            if (p.charClass === 'Warrior') {
                p.buffs.str = 1.8 + (p.upgrades.ult * 0.2);
                setTimeout(() => { if (players[socket.id]) players[socket.id].buffs.str = 1.0; }, 7000);
            } else if (p.charClass === 'Archer') {
                p.x += Math.cos(p.angle) * (450 + p.upgrades.ult * 50);
                p.y += Math.sin(p.angle) * (450 + p.upgrades.ult * 50);
            } else if (p.charClass === 'Mage') {
                p.hp = Math.min(p.maxHp, p.hp + 100 + (p.upgrades.ult * 50));
            }
            p.mana -= 60; p.cooldowns[key] = Date.now() + 10000;
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

// --- SERVER TICK ---
setInterval(() => {
    const now = Date.now();
    Object.values(players).forEach(p => {
        // Regen
        p.mana = Math.min(p.maxMana, p.mana + 0.8 * (p.charClass === 'Mage' ? (1 + p.upgrades.branchA * 0.4) : 1));
        
        // Training
        if (p.room === 'gym') p.str += 0.08 * (p.charClass === 'Warrior' ? 2 : 1);
        if (p.room === 'lake' && (p.keys.w || p.keys.a || p.keys.s || p.keys.d)) p.spd += 0.0015 * (p.charClass === 'Archer' ? 2 : 1);
        if (p.room === 'shrine' && !Object.values(p.keys).some(k => k)) p.def += 0.03 * (p.charClass === 'Mage' ? 2 : 1);

        // Monster Logic
        monsters.forEach(m => {
            if (!m.isAlive || m.room !== p.room) return;
            let dist = Math.hypot(p.x - m.x, p.y - m.y);
            if (dist < (m.isBoss ? 2000 : 600)) {
                let ang = Math.atan2(p.y - m.y, p.x - m.x);
                let slw = (m.st > now) ? 0.5 : 1;
                m.x += Math.cos(ang) * m.spd * slw; m.y += Math.sin(ang) * m.spd * slw;
                if (dist < 65 && now - (m.latk || 0) > 1000) {
                    let df = p.def * GEAR_DATA.armor[p.gear.armor] * (p.charClass === 'Warrior' ? 1.5 : 1.0);
                    p.hp -= Math.max(10, m.str - (df * 0.5)); m.latk = now;
                    if (p.hp <= 0) respawn(p);
                }
            }
        });
    });

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let pr = projectiles[i]; pr.x += pr.vx; pr.y += pr.vy;
        monsters.forEach(m => {
            if (m.isAlive && m.room === pr.room && Math.hypot(pr.x - m.x, pr.y - m.y) < 75) {
                m.hp -= pr.damage; if (pr.slow) m.st = now + 2500;
                projectiles.splice(i, 1);
                if (m.hp <= 0) {
                    m.isAlive = false; 
                    if (players[pr.owner]) { 
                        players[pr.owner].gold += m.gold; 
                        if (m.isBoss) players[pr.owner].skillPoints += 5; 
                    }
                    setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 15000);
                }
            }
        });
        if (pr && (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE)) projectiles.splice(i, 1);
    }
    io.emit('update', { players, monsters, projectiles });
}, TICK_RATE);

http.listen(3000, () => console.log('Server running on 3000'));
