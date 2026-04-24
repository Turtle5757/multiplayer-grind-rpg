const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- GLOBAL SETTINGS ---
const WORLD_SIZE = 2000;
const TICK_RATE = 30; // 30ms updates (~33 FPS)

// --- ITEM & GEAR DATA ---
const GEAR_DATA = {
    sword: [1.0, 1.2, 1.5, 2.0, 3.0], // STR Multipliers
    armor: [1.0, 1.2, 1.5, 2.0, 3.5], // DEF Multipliers
    boots: [1.0, 1.1, 1.3, 1.6, 2.2]  // SPD Multipliers
};

// --- WORLD STRUCTURE ---
const ROOMS = {
    hub: { name: "Village", bg: "#15220d" },
    gym: { name: "Warrior's Gym", bg: "#3d2b1f" },
    lake: { name: "Swift Lake", bg: "#1a3a4a" },
    shrine: { name: "Meditation Shrine", bg: "#1b2e2b" },
    shop: { name: "Blacksmith", bg: "#2c3e50" },
    graveyard: { name: "Cursed Graveyard", bg: "#1a1a1a" },
    boss_room: { name: "The Void", bg: "#2d0000" }
};

const PORTALS = [
    // Hub Portals
    { fromRoom: 'hub', toRoom: 'gym', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'STR GYM' },
    { fromRoom: 'hub', toRoom: 'lake', x: 1900, y: 1000, targetX: 1800, targetY: 1000, color: '#3498db', label: 'SPD LAKE' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#2ecc71', label: 'DEF SHRINE' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#f1c40f', label: 'SHOP' },
    { fromRoom: 'hub', toRoom: 'graveyard', x: 1800, y: 200, targetX: 1000, targetY: 1850, color: '#555', label: 'DUNGEON' },
    // Combat Portals
    { fromRoom: 'graveyard', toRoom: 'boss_room', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#ff0000', label: 'BOSS GATE' },
    { fromRoom: 'boss_room', toRoom: 'graveyard', x: 1000, y: 1900, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT' },
    // Back to Hub Portals
    { fromRoom: 'gym', toRoom: 'hub', x: 1900, y: 1000, targetX: 250, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'lake', toRoom: 'hub', x: 1900, y: 1000, targetX: 1750, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shrine', toRoom: 'hub', x: 1000, y: 1900, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 100, targetX: 1000, targetY: 1750, color: '#fff', label: 'EXIT' },
    { fromRoom: 'graveyard', toRoom: 'hub', x: 1000, y: 1950, targetX: 1700, targetY: 350, color: '#fff', label: 'EXIT' }
];

// --- ENGINE STATE ---
let users = {}; // Saved Accounts
let players = {}; // Active sessions
let projectiles = [];
let monsters = [
    { id: 1, x: 500, y: 500, hp: 300, maxHp: 300, str: 30, gold: 40, room: 'graveyard', isAlive: true, spd: 2.2 },
    { id: 2, x: 1500, y: 1500, hp: 300, maxHp: 300, str: 30, gold: 40, room: 'graveyard', isAlive: true, spd: 2.2 },
    { 
        id: 'BOSS', x: 1000, y: 1000, hp: 6000, maxHp: 6000, str: 120, gold: 2000, 
        room: 'boss_room', isAlive: true, spd: 1.8, isBoss: true, 
        lastRingAtk: 0, lastSpawnAtk: 0 
    }
];

// --- HELPER FUNCTIONS ---
function respawn(p) {
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.room = 'hub';
    p.x = 1000;
    p.y = 1000;
}

// --- NETWORK HANDLERS ---
io.on('connection', (socket) => {
    
    // Account Registration
    socket.on('register', (data) => {
        if (!users[data.name]) {
            users[data.name] = { 
                password: data.password, 
                charClass: data.charClass || 'Warrior',
                str: 10, def: 5, spd: 4, gold: 0,
                skillPoints: 1, 
                upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
                gear: { sword: 0, armor: 0, boots: 0 } 
            };
            socket.emit('authMessage', 'Account Created!');
        } else {
            socket.emit('authError', 'Name taken.');
        }
    });

    // Login and Session Init
    socket.on('login', (data) => {
        const u = users[data.name];
        if (u && u.password === data.password) {
            players[socket.id] = {
                id: socket.id,
                name: data.name,
                charClass: u.charClass,
                x: 1000, y: 1000, room: 'hub',
                hp: 100 + (u.charClass === 'Warrior' ? u.upgrades.branchB * 50 : 0),
                maxHp: 100 + (u.charClass === 'Warrior' ? u.upgrades.branchB * 50 : 0),
                mana: 100,
                maxMana: 100,
                gold: u.gold,
                str: u.str,
                def: u.def,
                spd: u.spd,
                skillPoints: u.skillPoints,
                upgrades: u.upgrades,
                gear: u.gear,
                buffs: { str: 1.0 },
                cooldowns: { Q: 0, E: 0 },
                keys: { w: false, a: false, s: false, d: false },
                angle: 0
            };
            socket.emit('init', { id: socket.id, rooms: ROOMS, portals: PORTALS });
        } else {
            socket.emit('authError', 'Invalid credentials.');
        }
    });

    // Skill Tree Logic
    socket.on('upgradeSkill', (branch) => {
        const p = players[socket.id];
        if (!p || p.skillPoints <= 0) return;
        if (p.upgrades[branch] < 3) {
            p.upgrades[branch]++;
            p.skillPoints--;
            // Update stats immediately if it's the Juggernaut HP upgrade
            if (p.charClass === 'Warrior' && branch === 'branchB') {
                p.maxHp += 50;
                p.hp += 50;
            }
        }
    });

    // Movement & Portals
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;
        p.keys = data.keys;
        p.angle = data.angle;

        let classSpeed = (p.charClass === 'Archer') ? 1.35 : 1.0;
        let speed = p.spd * GEAR_DATA.boots[p.gear.boots] * classSpeed;

        if (p.keys.w) p.y -= speed;
        if (p.keys.s) p.y += speed;
        if (p.keys.a) p.x -= speed;
        if (p.keys.d) p.x += speed;

        p.x = Math.max(0, Math.min(p.x, WORLD_SIZE));
        p.y = Math.max(0, Math.min(p.y, WORLD_SIZE));

        PORTALS.forEach(pt => {
            if (p.room === pt.fromRoom && Math.hypot(p.x - pt.x, p.y - pt.y) < 80) {
                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
            }
        });
    });

    // Melee vs Ranged Combat
    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p || p.room === 'hub') return;
        if (Date.now() - (p.lastAtk || 0) < 350) return; // Attack speed cap
        p.lastAtk = Date.now();

        let classDmg = (p.charClass === 'Mage') ? 1.4 : 1.0;
        let damage = p.str * GEAR_DATA.sword[p.gear.sword] * p.buffs.str * classDmg;

        if (p.charClass === 'Warrior') {
            monsters.forEach(m => {
                if (m.isAlive && m.room === p.room && Math.hypot(p.x - m.x, p.y - m.y) < 130) {
                    m.hp -= damage;
                    // Lifesteal Passive
                    if (p.upgrades.branchA > 0) {
                        p.hp = Math.min(p.maxHp, p.hp + (damage * (p.upgrades.branchA * 0.07)));
                    }
                    if (m.hp <= 0) {
                        m.isAlive = false;
                        p.gold += m.gold;
                        if (m.isBoss) p.skillPoints += 3;
                        setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 12000);
                    }
                }
            });
            socket.emit('swingEffect');
        } else {
            // Multishot Logic
            let mult = (p.charClass === 'Archer' && Math.random() < p.upgrades.branchB * 0.25) ? 2 : 1;
            for (let i = 0; i < mult; i++) {
                projectiles.push({ 
                    x: p.x, y: p.y, 
                    vx: Math.cos(p.angle + (i * 0.12)) * 18, 
                    vy: Math.sin(p.angle + (i * 0.12)) * 18, 
                    owner: socket.id, room: p.room, damage: damage,
                    slow: (p.charClass === 'Mage' ? p.upgrades.branchB * 0.2 : 0)
                });
            }
        }
    });

    // Activated Skill Binding & Logic
    socket.on('useAbility', (data) => {
        const p = players[socket.id];
        const { key, skillId } = data; 
        if (!p || Date.now() < p.cooldowns[key] || p.room === 'hub') return;
        if (p.upgrades[skillId] <= 0) return;

        if (skillId === 'start' && p.mana >= 25) {
            let power = 2.0 + (p.upgrades.start * 0.6);
            projectiles.push({ 
                x: p.x, y: p.y, vx: Math.cos(p.angle)*24, vy: Math.sin(p.angle)*24, 
                owner: socket.id, room: p.room, damage: p.str * power, isSpecial: true 
            });
            p.mana -= 25;
            p.cooldowns[key] = Date.now() + 2500;
        } 
        else if (skillId === 'ult' && p.mana >= 50) {
            if (p.charClass === 'Warrior') {
                p.buffs.str = 1.7 + (p.upgrades.ult * 0.15);
                setTimeout(() => { if (players[socket.id]) players[socket.id].buffs.str = 1.0; }, 6000);
            } else if (p.charClass === 'Archer') {
                let dash = 400 + (p.upgrades.ult * 60);
                p.x += Math.cos(p.angle) * dash; p.y += Math.sin(p.angle) * dash;
            } else if (p.charClass === 'Mage') {
                p.hp = Math.min(p.maxHp, p.hp + 60 + (p.upgrades.ult * 30));
            }
            p.mana -= 50;
            p.cooldowns[key] = Date.now() + 9000;
        }
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p) {
            users[p.name] = { 
                ...users[p.name], 
                str: p.str, def: p.def, spd: p.spd, gold: p.gold, 
                skillPoints: p.skillPoints, upgrades: p.upgrades, gear: p.gear 
            };
            delete players[socket.id];
        }
    });
});

// --- MAIN SERVER TICK ---
setInterval(() => {
    const now = Date.now();
    
    Object.values(players).forEach(p => {
        // Mana Regeneration
        let mRegen = 0.6 * (p.charClass === 'Mage' ? (1 + p.upgrades.branchA * 0.3) : 1.0);
        p.mana = Math.min(p.maxMana, p.mana + mRegen);

        // Room-Based Training
        let sT = (p.charClass === 'Warrior' ? 2.2 : 1.0);
        let dT = (p.charClass === 'Mage' ? 2.2 : 1.0);
        let vT = (p.charClass === 'Archer' ? 2.2 : 1.0);

        if (p.room === 'gym') p.str += 0.06 * sT;
        if (p.room === 'lake' && (p.keys.w || p.keys.a || p.keys.s || p.keys.d)) p.spd += 0.0012 * vT;
        if (p.room === 'shrine' && !(p.keys.w || p.keys.a || p.keys.s || p.keys.d)) p.def += 0.025 * dT;

        // Monster Aggro & AI
        monsters.forEach(m => {
            if (!m.isAlive || m.room !== p.room) return;
            let dist = Math.hypot(p.x - m.x, p.y - m.y);
            let limit = m.isBoss ? 5000 : 700;

            if (dist < limit) {
                let ang = Math.atan2(p.y - m.y, p.x - m.x);
                let slowFactor = (m.slowUntil > now) ? 0.45 : 1.0;
                m.x += Math.cos(ang) * (m.spd * slowFactor);
                m.y += Math.sin(ang) * (m.spd * slowFactor);

                // Monster Collision Damage
                if (dist < 68 && now - (m.lastHit || 0) > 1000) {
                    let wBonus = (p.charClass === 'Warrior') ? 1.4 : 1.0;
                    let finalDef = p.def * GEAR_DATA.armor[p.gear.armor] * wBonus;
                    p.hp -= Math.max(8, m.str - (finalDef * 0.6));
                    m.lastHit = now;
                    if (p.hp <= 0) respawn(p);
                }

                // Boss Special Attacks
                if (m.isBoss) {
                    if (now - m.lastRingAtk > 4000) {
                        for (let i = 0; i < 12; i++) {
                            let rA = (i / 12) * Math.PI * 2;
                            projectiles.push({ x: m.x, y: m.y, vx: Math.cos(rA)*10, vy: Math.sin(rA)*10, owner: 'BOSS', room: m.room, damage: 45 });
                        }
                        m.lastRingAtk = now;
                    }
                }
            }
        });
    });

    // Projectile Movement & Collision
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let pr = projectiles[i];
        pr.x += pr.vx;
        pr.y += pr.vy;

        monsters.forEach(m => {
            if (pr.owner !== 'BOSS' && m.isAlive && m.room === pr.room && Math.hypot(pr.x - m.x, pr.y - m.y) < 80) {
                m.hp -= pr.damage;
                if (pr.slow) m.slowUntil = now + 2500;
                projectiles.splice(i, 1);
                if (m.hp <= 0) {
                    m.isAlive = false;
                    if (players[pr.owner]) {
                        players[pr.owner].gold += m.gold;
                        if (m.isBoss) players[pr.owner].skillPoints += 4;
                    }
                    setTimeout(() => { m.isAlive = true; m.hp = m.maxHp; }, 12000);
                }
            }
        });

        // Cleanup
        if (pr && (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE)) {
            projectiles.splice(i, 1);
        }
    }

    io.emit('update', { players, monsters, projectiles });
}, TICK_RATE);

http.listen(3000, () => console.log('FULL SERVER ONLINE AT PORT 3000'));
