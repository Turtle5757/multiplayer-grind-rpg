const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- CONFIGURATION ---
const WORLD_SIZE = 2000;
const TICK_RATE = 30;
const PVP_ZONE = 'graveyard'; 
const BOSS_ZONE = 'boss_room';

// --- DATA ---
const users = {}; 
const GEAR_DATA = {
    sword: { stat: 'str', tiers: [
        { name: "Wooden Stick", mult: 1.0, cost: 0 },
        { name: "Rusty Dagger", mult: 1.2, cost: 150 },
        { name: "Iron Broadsword", mult: 1.5, cost: 500 },
        { name: "Diamond Blade", mult: 2.0, cost: 1200 },
        { name: "Dragon Slayer", mult: 3.0, cost: 5000 }
    ]},
    boots: { stat: 'spd', tiers: [
        { name: "Old Rags", mult: 1.0, cost: 0 },
        { name: "Leather Sandals", mult: 1.1, cost: 200 },
        { name: "Reinforced Boots", mult: 1.3, cost: 600 },
        { name: "Swift Greaves", mult: 1.6, cost: 1500 },
        { name: "Hermes' Wings", mult: 2.2, cost: 4500 }
    ]},
    armor: { stat: 'def', tiers: [
        { name: "Tattered Shirt", mult: 1.0, cost: 0 },
        { name: "Leather Tunic", mult: 1.2, cost: 300 },
        { name: "Chainmail", mult: 1.5, cost: 800 },
        { name: "Plate Armor", mult: 2.0, cost: 2000 },
        { name: "Guardian Shell", mult: 3.5, cost: 6000 }
    ]}
};

const rooms = {
    hub: { name: "Village", bg: "#15220d" },
    gym: { name: "The Gym (STR)", bg: "#3d2b1f" },
    lake: { name: "Swift Lake (SPD)", bg: "#1a3a4a" },
    shrine: { name: "Meditation Shrine (DEF)", bg: "#1b2e2b" },
    shop: { name: "Blacksmith's Forge", bg: "#2c3e50" },
    graveyard: { name: "Graveyard", bg: "#1a1a1a" },
    boss_room: { name: "The Forbidden Lair", bg: "#2d0000" }
};

const PORTALS = [
    { fromRoom: 'hub', toRoom: 'gym', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'GYM' },
    { fromRoom: 'hub', toRoom: 'lake', x: 1900, y: 1000, targetX: 1800, targetY: 1000, color: '#3498db', label: 'LAKE' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#2ecc71', label: 'SHRINE' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#f1c40f', label: 'BLACKSMITH' },
    { fromRoom: 'hub', toRoom: 'graveyard', x: 1800, y: 200, targetX: 1000, targetY: 1850, color: '#555', label: 'DUNGEON' },
    { fromRoom: 'graveyard', toRoom: 'boss_room', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#ff0000', label: 'BOSS LAIR' },
    { fromRoom: 'boss_room', toRoom: 'graveyard', x: 1000, y: 1900, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT' },
    { fromRoom: 'gym', toRoom: 'hub', x: 1900, y: 1000, targetX: 250, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'lake', toRoom: 'hub', x: 1900, y: 1000, targetX: 1750, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shrine', toRoom: 'hub', x: 1000, y: 1900, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 100, targetX: 1000, targetY: 1750, color: '#fff', label: 'EXIT' },
    { fromRoom: 'graveyard', toRoom: 'hub', x: 1000, y: 1950, targetX: 1700, targetY: 350, color: '#fff', label: 'EXIT' }
];

let players = {};
let projectiles = [];
let monsters = [
    { id: 1, x: 500, y: 500, hp: 200, maxHp: 200, str: 25, gold: 30, room: 'graveyard', isAlive: true, spd: 2 },
    { id: 2, x: 1500, y: 500, hp: 200, maxHp: 200, str: 25, gold: 30, room: 'graveyard', isAlive: true, spd: 2 },
    { id: 'BOSS', x: 1000, y: 1000, hp: 5000, maxHp: 5000, str: 100, gold: 5000, room: 'boss_room', isAlive: true, spd: 1, isBoss: true, lastRingAtk: 0, lastSpawnAtk: 0 }
];

function respawn(p) { p.hp = 100; p.room = 'hub'; p.x = 1000; p.y = 1000; }

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        if (!users[data.name]) {
            users[data.name] = { 
                password: data.password, charClass: data.charClass || 'Warrior',
                str: 10, def: 5, spd: 4, gold: 0, gearLevels: { sword: 0, armor: 0, boots: 0 } 
            };
            socket.emit('authMessage', 'Registered!');
        } else socket.emit('authError', 'User exists.');
    });

    socket.on('login', (data) => {
        const u = users[data.name];
        if (u && u.password === data.password) {
            players[socket.id] = {
                id: socket.id, name: data.name, charClass: u.charClass,
                x: 1000, y: 1000, hp: 100, maxHp: 100, energy: 100, room: 'hub',
                str: u.str, def: u.def, spd: u.spd, gold: u.gold, gearLevels: u.gearLevels,
                mults: { 
                    str: GEAR_DATA.sword.tiers[u.gearLevels.sword].mult,
                    def: GEAR_DATA.armor.tiers[u.gearLevels.armor].mult,
                    spd: GEAR_DATA.boots.tiers[u.gearLevels.boots].mult
                },
                buffs: { str: 1.0 }, cooldowns: { Q: 0, E: 0 },
                keys: { w: false, a: false, s: false, d: false }, angle: 0,
                color: u.charClass === 'Warrior' ? '#e67e22' : (u.charClass === 'Archer' ? '#2ecc71' : '#9b59b6')
            };
            socket.emit('init', { id: socket.id, rooms, portals: PORTALS });
        } else socket.emit('authError', 'Invalid Login.');
    });

    socket.on('move', (data) => {
        const p = players[socket.id]; if (!p) return;
        p.keys = data.keys; p.angle = data.angle;
        let speed = p.spd * p.mults.spd;
        if (p.keys.w) p.y -= speed; if (p.keys.s) p.y += speed;
        if (p.keys.a) p.x -= speed; if (p.keys.d) p.x += speed;
        p.x = Math.max(0, Math.min(p.x, WORLD_SIZE)); p.y = Math.max(0, Math.min(p.y, WORLD_SIZE));
        PORTALS.forEach(pt => {
            if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 80) {
                p.room = pt.toRoom; p.x = pt.targetX; p.y = pt.targetY;
            }
        });
    });

    socket.on('attack', () => {
        const p = players[socket.id]; if (!p) return;
        if (p.room !== PVP_ZONE && p.room !== BOSS_ZONE) return; // Attack restricted
        if (Date.now() - (p.lastAtk || 0) < 350) return;
        p.lastAtk = Date.now();
        projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.angle)*16, vy: Math.sin(p.angle)*16, owner: socket.id, room: p.room, damage: p.str * p.mults.str * p.buffs.str });
    });

    socket.on('buyItem', (category) => {
        const p = players[socket.id]; if (!p || p.room !== 'shop') return;
        let nextLvl = p.gearLevels[category] + 1;
        let data = GEAR_DATA[category];
        if (nextLvl >= data.tiers.length) return;
        if (p.gold >= data.tiers[nextLvl].cost) {
            p.gold -= data.tiers[nextLvl].cost;
            p.gearLevels[category] = nextLvl;
            p.mults[data.stat] = data.tiers[nextLvl].mult;
            socket.emit('notification', `Purchased ${data.tiers[nextLvl].name}!`);
        }
    });

    socket.on('useAbility', (key) => {
        const p = players[socket.id]; if (!p || Date.now() < p.cooldowns[key] || (p.room !== PVP_ZONE && p.room !== BOSS_ZONE)) return;
        if (key === 'Q' && p.energy >= 20) {
            projectiles.push({ x: p.x, y: p.y, vx: Math.cos(p.angle)*22, vy: Math.sin(p.angle)*22, owner: socket.id, room: p.room, damage: p.str*2.5, isSpecial: true });
            p.energy -= 20; p.cooldowns.Q = Date.now() + 2000;
        } else if (key === 'E' && p.energy >= 40) {
            if (p.charClass === 'Warrior') { p.buffs.str = 1.6; setTimeout(() => { if(players[socket.id]) players[socket.id].buffs.str = 1.0; }, 5000); }
            else if (p.charClass === 'Archer') { p.x += Math.cos(p.angle)*300; p.y += Math.sin(p.angle)*300; }
            else if (p.charClass === 'Mage') { p.hp = Math.min(p.maxHp, p.hp + 50); }
            p.energy -= 40; p.cooldowns.E = Date.now() + 8000;
        }
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p) {
            users[p.name] = { ...users[p.name], str: p.str, def: p.def, spd: p.spd, gold: p.gold, gearLevels: p.gearLevels };
            delete players[socket.id];
        }
    });
});

setInterval(() => {
    const now = Date.now();
    Object.values(players).forEach(p => {
        p.energy = Math.min(100, p.energy + 0.5);
        if (p.room === 'gym') p.str += 0.05; 
        if (p.room === 'lake' && (p.keys.w||p.keys.a||p.keys.s||p.keys.d)) p.spd += 0.001; 
        if (p.room === 'shrine' && !(p.keys.w||p.keys.a||p.keys.s||p.keys.d)) p.def += 0.02;

        monsters.forEach(m => {
            if (!m.isAlive || m.room !== p.room) return;
            if (m.isBoss) {
                if (now - m.lastRingAtk > 3000) {
                    for (let i = 0; i < 12; i++) {
                        let a = (i / 12) * Math.PI * 2;
                        projectiles.push({ x: m.x, y: m.y, vx: Math.cos(a)*8, vy: Math.sin(a)*8, owner: 'BOSS', room: m.room, damage: 40 });
                    }
                    m.lastRingAtk = now;
                }
                if (now - m.lastSpawnAtk > 10000) {
                    monsters.push({ id: now, x: m.x + (Math.random()*200-100), y: m.y + 200, hp: 100, maxHp: 100, str: 15, gold: 10, room: BOSS_ZONE, isAlive: true, spd: 3, isMinion: true });
                    m.lastSpawnAtk = now;
                }
            }
            let d = Math.hypot(p.x - m.x, p.y - m.y);
            if (d < 600) {
                let a = Math.atan2(p.y - m.y, p.x - m.x);
                m.x += Math.cos(a)*m.spd; m.y += Math.sin(a)*m.spd;
                if (d < 60 && now - (m.lastAtk || 0) > 1000) {
                    p.hp -= Math.max(5, m.str - (p.def * p.mults.def * 0.5)); m.lastAtk = now;
                    if (p.hp <= 0) respawn(p);
                }
            }
        });
    });

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let pr = projectiles[i]; pr.x += pr.vx; pr.y += pr.vy;
        monsters.forEach(m => {
            if (m.isAlive && m.room === pr.room && Math.hypot(pr.x - m.x, pr.y - m.y) < 60) {
                m.hp -= pr.damage; projectiles.splice(i, 1);
                if (m.hp <= 0) {
                    m.isAlive = false; if (players[pr.owner]) players[pr.owner].gold += m.gold;
                    if (!m.isMinion) setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 10000);
                }
            }
        });
        if (pr && projectiles[i] && pr.room === PVP_ZONE) {
            for (let id in players) {
                let target = players[id];
                if (id !== pr.owner && target.room === PVP_ZONE && Math.hypot(pr.x - target.x, pr.y - target.y) < 40) {
                    target.hp -= Math.max(5, pr.damage - (target.def * target.mults.def * 0.5));
                    if (target.hp <= 0) {
                        if (players[pr.owner]) {
                            let stolen = Math.floor(target.gold * 0.20);
                            players[pr.owner].gold += stolen; target.gold -= stolen;
                        }
                        respawn(target);
                    }
                    projectiles.splice(i, 1); break;
                }
            }
        }
        if (pr && (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE)) projectiles.splice(i, 1);
    }
    io.emit('update', { players, monsters, projectiles });
}, TICK_RATE);

http.listen(3000, () => console.log('Server Live :3000'));
