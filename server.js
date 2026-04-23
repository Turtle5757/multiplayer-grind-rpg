const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- CONFIGURATION ---
const WORLD_SIZE = 2000;
const TICK_RATE = 30;

// --- PERSISTENT DATABASE ---
const users = {}; 

// --- UPGRADE TIER DATA ---
const UPGRADE_TIERS = [
    { name: "Novice", mult: 1.0 },
    { name: "Apprentice", mult: 1.1 },
    { name: "Hardened", mult: 1.2 },
    { name: "Elite", mult: 1.3 },
    { name: "Master", mult: 1.4 },
    { name: "Grandmaster", mult: 1.6 },
    { name: "Legendary", mult: 1.8 },
    { name: "Mythic", mult: 2.2 }
];

// --- WORLD SETUP ---
const rooms = {
    hub: { name: "Village", bg: "#15220d" },
    gym: { name: "The Gym (STR)", bg: "#3d2b1f" },
    lake: { name: "Swift Lake (SPD)", bg: "#1a3a4a" },
    shrine: { name: "Meditation Shrine (DEF)", bg: "#1b2e2b" },
    shop: { name: "Blacksmith's Forge", bg: "#2c3e50" },
    graveyard: { name: "Graveyard", bg: "#1a1a1a" }
};

const PORTALS = [
    { fromRoom: 'hub', toRoom: 'gym', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'GYM' },
    { fromRoom: 'hub', toRoom: 'lake', x: 1900, y: 1000, targetX: 1800, targetY: 1000, color: '#3498db', label: 'LAKE' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#2ecc71', label: 'SHRINE' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#f1c40f', label: 'BLACKSMITH' },
    { fromRoom: 'hub', toRoom: 'graveyard', x: 1800, y: 200, targetX: 1000, targetY: 1850, color: '#555', label: 'DUNGEON' },
    
    { fromRoom: 'gym', toRoom: 'hub', x: 1900, y: 1000, targetX: 250, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'lake', toRoom: 'hub', x: 1900, y: 1000, targetX: 1750, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shrine', toRoom: 'hub', x: 1000, y: 1900, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 100, targetX: 1000, targetY: 1750, color: '#fff', label: 'EXIT' },
    { fromRoom: 'graveyard', toRoom: 'hub', x: 1000, y: 1950, targetX: 1700, targetY: 350, color: '#fff', label: 'EXIT' }
];

// --- ENTITIES ---
let players = {};
let projectiles = [];
let monsters = [
    { id: 1, x: 400, y: 400, hp: 150, maxHp: 150, str: 20, gold: 60, room: 'graveyard', isAlive: true, spd: 2.2 },
    { id: 2, x: 1600, y: 1600, hp: 150, maxHp: 150, str: 20, gold: 60, room: 'graveyard', isAlive: true, spd: 2.2 },
    { id: 3, x: 1000, y: 1000, hp: 500, maxHp: 500, str: 50, gold: 500, room: 'graveyard', isAlive: true, spd: 1.2 }
];

// --- HELPER FUNCTIONS ---
function respawn(p) {
    p.hp = 100; p.room = 'hub'; p.x = 1000; p.y = 1000;
}

// --- SOCKET CONNECTION ---
io.on('connection', (socket) => {

    socket.on('register', (data) => {
        if (!users[data.name]) {
            users[data.name] = { 
                password: data.password, charClass: data.charClass || 'Warrior',
                str: 10, def: 5, spd: 4, gold: 0, 
                upgradeTiers: { str: 0, def: 0, spd: 0 } 
            };
            socket.emit('authMessage', 'Account Registered!');
        } else {
            socket.emit('authError', 'User exists.');
        }
    });

    socket.on('login', (data) => {
        const u = users[data.name];
        if (u && u.password === data.password) {
            players[socket.id] = {
                id: socket.id, name: data.name, charClass: u.charClass,
                x: 1000, y: 1000, hp: 100, maxHp: 100, energy: 100, room: 'hub',
                str: u.str, def: u.def, spd: u.spd, gold: u.gold,
                upgradeTiers: u.upgradeTiers || { str: 0, def: 0, spd: 0 },
                mults: { 
                    str: UPGRADE_TIERS[u.upgradeTiers?.str || 0].mult, 
                    def: UPGRADE_TIERS[u.upgradeTiers?.def || 0].mult, 
                    spd: UPGRADE_TIERS[u.upgradeTiers?.spd || 0].mult 
                },
                buffs: { str: 1.0 }, cooldowns: { Q: 0, E: 0 },
                keys: { w: false, a: false, s: false, d: false }, angle: 0,
                color: u.charClass === 'Warrior' ? '#e67e22' : (u.charClass === 'Archer' ? '#2ecc71' : '#9b59b6')
            };
            socket.emit('init', { id: socket.id, rooms, portals: PORTALS });
        } else {
            socket.emit('authError', 'Invalid Login.');
        }
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
        if (p.room === 'gym') p.str += 0.05;
        if (Date.now() - (p.lastAtk || 0) < 350) return;
        p.lastAtk = Date.now();
        projectiles.push({ 
            x: p.x, y: p.y, vx: Math.cos(p.angle)*16, vy: Math.sin(p.angle)*16, 
            owner: socket.id, room: p.room, damage: p.str * p.mults.str * p.buffs.str 
        });
    });

    socket.on('buyItem', (stat) => {
        const p = players[socket.id]; if (!p || p.room !== 'shop') return;
        let nextTier = p.upgradeTiers[stat] + 1;
        if (nextTier >= UPGRADE_TIERS.length) return socket.emit('authError', 'MAX TIER!');
        
        let cost = 100 * nextTier;
        if (p.gold >= cost) {
            p.gold -= cost;
            p.upgradeTiers[stat] = nextTier;
            p.mults[stat] = UPGRADE_TIERS[nextTier].mult;
            socket.emit('notification', `Upgraded to ${UPGRADE_TIERS[nextTier].name}!`);
        } else {
            socket.emit('authError', `Need ${cost} Gold!`);
        }
    });

    socket.on('useAbility', (key) => {
        const p = players[socket.id]; if (!p || Date.now() < p.cooldowns[key]) return;
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
            users[p.name] = { ...users[p.name], str: p.str, def: p.def, spd: p.spd, gold: p.gold, upgradeTiers: p.upgradeTiers };
            delete players[socket.id];
        }
    });
});

// --- GAME ENGINE ---
setInterval(() => {
    Object.values(players).forEach(p => {
        p.energy = Math.min(100, p.energy + 0.5);
        const moving = p.keys.w || p.keys.a || p.keys.s || p.keys.d;
        if (p.room === 'lake' && moving) p.spd += 0.001; 
        if (p.room === 'shrine' && !moving) p.def += 0.02;

        monsters.forEach(m => {
            if (m.isAlive && m.room === p.room) {
                let d = Math.hypot(p.x - m.x, p.y - m.y);
                if (d < 450) {
                    let a = Math.atan2(p.y - m.y, p.x - m.x);
                    m.x += Math.cos(a)*m.spd; m.y += Math.sin(a)*m.spd;
                    if (d < 50 && Date.now() - (m.lastAtk || 0) > 1000) {
                        p.hp -= Math.max(2, m.str - (p.def * p.mults.def * 0.4)); m.lastAtk = Date.now();
                        if (p.hp <= 0) respawn(p);
                    }
                }
            }
        });
    });

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let pr = projectiles[i]; pr.x += pr.vx; pr.y += pr.vy;
        
        // Monster Hits
        monsters.forEach(m => {
            if (m.isAlive && m.room === pr.room && Math.hypot(pr.x - m.x, pr.y - m.y) < 50) {
                m.hp -= pr.damage; projectiles.splice(i, 1);
                if (m.hp <= 0) {
                    m.isAlive = false; if (players[pr.owner]) players[pr.owner].gold += m.gold;
                    setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 8000);
                }
            }
        });

        // PvP Hits + Stealing
        if (pr && projectiles[i]) {
            for (let id in players) {
                let target = players[id];
                if (id !== pr.owner && target.room === pr.room && Math.hypot(pr.x - target.x, pr.y - target.y) < 40) {
                    target.hp -= Math.max(5, pr.damage - (target.def * target.mults.def * 0.5));
                    if (target.hp <= 0) {
                        if (players[pr.owner]) {
                            let stolen = Math.floor(target.gold * 0.20); // 20% Steal
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

http.listen(3000, () => console.log('Server running on port 3000'));
