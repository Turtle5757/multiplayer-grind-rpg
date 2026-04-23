const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- GAME CONSTANTS ---
const WORLD_SIZE = 2000;
const TICK_RATE = 30; // 30ms update interval

// --- DATABASE (In-Memory) ---
// This stores every user who registers so they can log back in with their stats.
const users = {}; 

// --- WORLD DATA ---
const rooms = {
    hub: { name: "Village", bg: "#15220d" },
    gym: { name: "The Gym (STR)", bg: "#3d2b1f" },
    lake: { name: "Swift Lake (SPD)", bg: "#1a3a4a" },
    shrine: { name: "Meditation Shrine (DEF)", bg: "#1b2e2b" },
    shop: { name: "Blacksmith's Forge", bg: "#2c3e50" },
    graveyard: { name: "Graveyard", bg: "#1a1a1a" }
};

const PORTALS = [
    // HUB -> ZONES
    { fromRoom: 'hub', toRoom: 'gym', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'GYM' },
    { fromRoom: 'hub', toRoom: 'lake', x: 1900, y: 1000, targetX: 1800, targetY: 1000, color: '#3498db', label: 'LAKE' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#2ecc71', label: 'SHRINE' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#f1c40f', label: 'BLACKSMITH' },
    { fromRoom: 'hub', toRoom: 'graveyard', x: 1800, y: 200, targetX: 1000, targetY: 1850, color: '#555', label: 'DUNGEON' },
    
    // ZONES -> HUB
    { fromRoom: 'gym', toRoom: 'hub', x: 1900, y: 1000, targetX: 250, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'lake', toRoom: 'hub', x: 1900, y: 1000, targetX: 1750, targetY: 1000, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shrine', toRoom: 'hub', x: 1000, y: 1900, targetX: 1000, targetY: 250, color: '#fff', label: 'EXIT' },
    { fromRoom: 'shop', toRoom: 'hub', x: 1000, y: 100, targetX: 1000, targetY: 1750, color: '#fff', label: 'EXIT' },
    { fromRoom: 'graveyard', toRoom: 'hub', x: 1000, y: 1950, targetX: 1700, targetY: 350, color: '#fff', label: 'EXIT' }
];

// --- LIVE ENTITIES ---
let players = {};
let projectiles = [];
let monsters = [
    { 
        id: 1, 
        x: 500, y: 500, 
        hp: 150, maxHp: 150, 
        str: 20, gold: 75, 
        room: 'graveyard', 
        isAlive: true, 
        spd: 2.2,
        lastAtk: 0
    }
];

// --- NETWORK LOGIC ---
io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // 1. REGISTRATION
    socket.on('register', (data) => {
        const username = data.name;
        const password = data.password;

        if (!users[username]) {
            users[username] = { 
                password: password, 
                charClass: data.charClass || 'Warrior',
                str: 10, 
                def: 5, 
                spd: 4, 
                gold: 0,
                armorTier: 0 
            };
            socket.emit('authMessage', 'Account Created! You can now log in.');
        } else {
            socket.emit('authError', 'That username is taken.');
        }
    });

    // 2. LOGIN
    socket.on('login', (data) => {
        const username = data.name;
        const password = data.password;
        const userData = users[username];

        if (userData && userData.password === password) {
            // Spawn the player into the live world
            players[socket.id] = {
                id: socket.id,
                name: username,
                charClass: userData.charClass,
                x: 1000,
                y: 1000,
                hp: 100,
                maxHp: 100,
                energy: 100,
                room: 'hub',
                str: userData.str,
                def: userData.def,
                spd: userData.spd,
                gold: userData.gold,
                armorTier: userData.armorTier,
                // Multipliers (from Blacksmith)
                mults: { str: 1.0, def: 1.0, spd: 1.0 },
                // Temporary Buffs (from Abilities)
                buffs: { str: 1.0 },
                cooldowns: { Q: 0, E: 0 },
                keys: { w: false, a: false, s: false, d: false },
                angle: 0,
                color: getPlayerColor(userData.charClass)
            };
            socket.emit('init', { id: socket.id, rooms, portals: PORTALS });
        } else {
            socket.emit('authError', 'Invalid username or password.');
        }
    });

    // 3. MOVEMENT & PORTALS
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.keys = data.keys;
        p.angle = data.angle;

        // Calculate velocity
        let speed = p.spd * p.mults.spd;
        if (p.keys.w) p.y -= speed;
        if (p.keys.s) p.y += speed;
        if (p.keys.a) p.x -= speed;
        if (p.keys.d) p.x += speed;

        // Keep player inside the world map
        p.x = Math.max(0, Math.min(p.x, WORLD_SIZE));
        p.y = Math.max(0, Math.min(p.y, WORLD_SIZE));

        // Check for Portal collisions
        for (let i = 0; i < PORTALS.length; i++) {
            let pt = PORTALS[i];
            if (p.room === pt.fromRoom) {
                let distance = Math.hypot(p.x - pt.x, p.y - pt.y);
                if (distance < 80) {
                    p.room = pt.toRoom;
                    p.x = pt.targetX;
                    p.y = pt.targetY;
                    break;
                }
            }
        }
    });

    // 4. COMBAT & TRAINING (Strength)
    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p) return;

        // Training logic: Earn STR by clicking in the Gym
        if (p.room === 'gym') {
            p.str += 0.05; // Balanced progression
        }

        // Attack cooldown (350ms)
        const now = Date.now();
        if (now - (p.lastAtk || 0) < 350) return;
        p.lastAtk = now;

        // Create Projectile
        projectiles.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(p.angle) * 16,
            vy: Math.sin(p.angle) * 16,
            owner: socket.id,
            room: p.room,
            damage: p.str * p.mults.str * p.buffs.str,
            isSpecial: false
        });
    });

    // 5. BLACKSMITH (Buying Upgrades)
    socket.on('buyItem', (type) => {
        const p = players[socket.id];
        if (!p || p.room !== 'shop') return;

        const COST = 100;
        if (p.gold >= COST) {
            p.gold -= COST;
            if (type === 'def') {
                p.armorTier += 1;
                p.mults.def += 0.15; // 15% boost to defense
            } else if (type === 'str') {
                p.mults.str += 0.10;
            } else if (type === 'spd') {
                p.mults.spd += 0.10;
            }
            socket.emit('notification', `Successfully upgraded ${type}!`);
        } else {
            socket.emit('authError', 'Not enough gold!');
        }
    });

    // 6. SPECIAL ABILITIES
    socket.on('useAbility', (key) => {
        const p = players[socket.id];
        if (!p) return;
        
        const now = Date.now();
        if (now < p.cooldowns[key]) return;

        // Q Ability: Power Shot (All Classes)
        if (key === 'Q' && p.energy >= 20) {
            projectiles.push({
                x: p.x, y: p.y,
                vx: Math.cos(p.angle) * 22,
                vy: Math.sin(p.angle) * 22,
                owner: socket.id,
                room: p.room,
                damage: p.str * 2.5,
                isSpecial: true
            });
            p.energy -= 20;
            p.cooldowns.Q = now + 2000;
        } 
        
        // E Ability: Class Specific
        else if (key === 'E' && p.energy >= 40) {
            if (p.charClass === 'Warrior') {
                // Rage: 60% damage boost for 5 seconds
                p.buffs.str = 1.6;
                setTimeout(() => { if (players[socket.id]) players[socket.id].buffs.str = 1.0; }, 5000);
            } else if (p.charClass === 'Archer') {
                // Dash: Lunge forward
                p.x += Math.cos(p.angle) * 300;
                p.y += Math.sin(p.angle) * 300;
            } else if (p.charClass === 'Mage') {
                // Heal: Restore HP
                p.hp = Math.min(p.maxHp, p.hp + 50);
            }
            p.energy -= 40;
            p.cooldowns.E = now + 8000;
        }
    });

    // 7. DISCONNECT & SAVE
    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p) {
            // Transfer current session stats back to the permanent user database
            users[p.name].str = p.str;
            users[p.name].def = p.def;
            users[p.name].spd = p.spd;
            users[p.name].gold = p.gold;
            users[p.name].armorTier = p.armorTier;
            delete players[socket.id];
        }
    });
});

// --- GAME ENGINE LOOP ---
setInterval(() => {
    // A. Update Players
    for (let id in players) {
        let p = players[id];
        
        // Passive Energy Regen
        p.energy = Math.min(100, p.energy + 0.4);

        // Training: Check Speed (Running in Lake) and Defense (Standing in Shrine)
        const isMoving = p.keys.w || p.keys.a || p.keys.s || p.keys.d;
        if (p.room === 'lake' && isMoving) {
            p.spd += 0.001; // Slower, balanced gain
        }
        if (p.room === 'shrine' && !isMoving) {
            p.def += 0.02; // Slower, balanced gain
        }

        // Monster Interaction
        for (let i = 0; i < monsters.length; i++) {
            let m = monsters[i];
            if (m.isAlive && m.room === p.room) {
                let dist = Math.hypot(p.x - m.x, p.y - m.y);
                // Aggro range: 450px
                if (dist < 450) {
                    let ang = Math.atan2(p.y - m.y, p.x - m.x);
                    m.x += Math.cos(ang) * m.spd;
                    m.y += Math.sin(ang) * m.spd;
                    
                    // Monster Attack
                    if (dist < 50) {
                        const now = Date.now();
                        if (now - m.lastAtk > 1000) {
                            // Damage formula: Monster STR minus 45% of Player DEF
                            let damageTaken = Math.max(2, m.str - (p.def * 0.45));
                            p.hp -= damageTaken;
                            m.lastAtk = now;

                            // Respawn player on death
                            if (p.hp <= 0) {
                                p.hp = 100;
                                p.room = 'hub';
                                p.x = 1000;
                                p.y = 1000;
                            }
                        }
                    }
                }
            }
        }
    }

    // B. Update Projectiles & Collisions
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let pr = projectiles[i];
        pr.x += pr.vx;
        pr.y += pr.vy;

        // Collision with Monsters
        for (let j = 0; j < monsters.length; j++) {
            let m = monsters[j];
            if (m.isAlive && m.room === pr.room) {
                if (Math.hypot(pr.x - m.x, pr.y - m.y) < 50) {
                    m.hp -= pr.damage;
                    projectiles.splice(i, 1);
                    
                    if (m.hp <= 0) {
                        m.isAlive = false;
                        if (players[pr.owner]) players[pr.owner].gold += m.gold;
                        // Respawn monster after 5 seconds
                        setTimeout(() => {
                            m.isAlive = true;
                            m.hp = m.maxHp;
                            m.x = 500; m.y = 500;
                        }, 5000);
                    }
                    break;
                }
            }
        }

        // Remove projectiles out of bounds
        if (pr && (pr.x < 0 || pr.x > WORLD_SIZE || pr.y < 0 || pr.y > WORLD_SIZE)) {
            projectiles.splice(i, 1);
        }
    }

    // C. Broadcast State to all clients
    io.emit('update', { players, monsters, projectiles });

}, TICK_RATE);

// HELPER: Class Colors
function getPlayerColor(charClass) {
    if (charClass === 'Warrior') return '#e67e22'; // Orange
    if (charClass === 'Archer') return '#2ecc71';  // Green
    if (charClass === 'Mage') return '#9b59b6';    // Purple
    return '#fff';
}

http.listen(3000, () => {
    console.log('--- RPG SERVER ONLINE ---');
    console.log('Port: 3000');
});
