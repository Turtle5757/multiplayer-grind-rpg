const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// ===================== CONFIG =====================
const WORLD_SIZE = 2000;
const TICK_RATE = 1000 / 30;

const GEAR_DATA = {
    sword: [1.0, 1.3, 1.7, 2.2, 3.5],
    armor: [1.0, 1.4, 1.8, 2.5, 4.0],
    boots: [1.0, 1.2, 1.4, 1.7, 2.5]
};

const PORTALS = [
    { fromRoom: 'hub', toRoom: 'gym', x: 100, y: 1000, targetX: 1800, targetY: 1000, color: '#e67e22', label: 'GYM' },
    { fromRoom: 'hub', toRoom: 'lake', x: 1900, y: 1000, targetX: 200, targetY: 1000, color: '#3498db', label: 'LAKE' },
    { fromRoom: 'hub', toRoom: 'shrine', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#2ecc71', label: 'SHRINE' },
    { fromRoom: 'hub', toRoom: 'shop', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#f1c40f', label: 'SHOP' },
    { fromRoom: 'hub', toRoom: 'graveyard', x: 1800, y: 200, targetX: 200, targetY: 200, color: '#555', label: 'GRAVEYARD' },

    { fromRoom: 'graveyard', toRoom: 'boss_room', x: 1000, y: 100, targetX: 1000, targetY: 1800, color: '#ff0000', label: 'BOSS' },
    { fromRoom: 'boss_room', toRoom: 'graveyard', x: 1000, y: 1900, targetX: 1000, targetY: 200, color: '#ffffff', label: 'EXIT' }
];

// ===================== STATE =====================
let users = {};
let players = {};
let projectiles = [];

let monsters = [
    { id: 1, x: 500, y: 500, hp: 200, maxHp: 200, str: 25, gold: 50, room: 'graveyard', isAlive: true, spd: 2 },
    { id: 2, x: 1500, y: 1200, hp: 200, maxHp: 200, str: 25, gold: 50, room: 'graveyard', isAlive: true, spd: 2 },
    { id: 'BOSS', x: 1000, y: 1000, hp: 8000, maxHp: 8000, str: 120, gold: 2500, room: 'boss_room', isAlive: true, spd: 1.8, isBoss: true }
];

// ===================== HELPERS =====================
function createPlayer(socketId, data) {
    return {
        id: socketId,
        name: data.name,
        charClass: data.charClass,

        x: 1000,
        y: 1000,
        room: 'hub',

        hp: 100,
        maxHp: 100,
        mana: 100,
        maxMana: 100,

        gold: 0,

        // stats
        str: 10,
        def: 5,
        spd: 4,

        // progression (NEW FIXED SYSTEM)
        level: 1,
        xp: 0,
        prestige: 0,

        skillPoints: 1,

        upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
        gear: { sword: 0, armor: 0, boots: 0 },

        buffs: { str: 1.0 },
        cooldowns: {},
        keys: {}
    };
}

function giveXP(p, amount) {
    p.xp += amount;

    const needed = 100 + p.level * 25;

    if (p.xp >= needed) {
        p.xp -= needed;
        p.level += 1;
        p.skillPoints += 1;

        p.maxHp += 10;
        p.hp = p.maxHp;
    }
}

function respawn(p) {
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.room = 'hub';
    p.x = 1000;
    p.y = 1000;
}

// ===================== SOCKET =====================
io.on('connection', (socket) => {

    socket.on('register', (data) => {
        if (!users[data.name]) {
            users[data.name] = {
                password: data.password,
                charClass: data.charClass,
                str: 10,
                def: 5,
                spd: 4,
                gold: 0,
                skillPoints: 1,
                upgrades: { start: 0, ult: 0, branchA: 0, branchB: 0 },
                gear: { sword: 0, armor: 0, boots: 0 }
            };

            socket.emit('authMessage', 'Registered!');
        } else {
            socket.emit('authError', 'User exists');
        }
    });

    socket.on('login', (data) => {
        const u = users[data.name];

        if (u && u.password === data.password) {
            players[socket.id] = createPlayer(socket.id, { ...data, ...u });

            // FIX: ALWAYS SEND FULL PLAYER DATA
            socket.emit('init', {
                id: socket.id,
                portals,
                self: players[socket.id]
            });
        } else {
            socket.emit('authError', 'Login failed');
        }
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

        p.x = Math.max(0, Math.min(WORLD_SIZE, p.x));
        p.y = Math.max(0, Math.min(WORLD_SIZE, p.y));

        // portals
        for (const pt of PORTALS) {
            if (p.room === pt.fromRoom &&
                Math.hypot(p.x - pt.x, p.y - pt.y) < 60) {
                p.room = pt.toRoom;
                p.x = pt.targetX;
                p.y = pt.targetY;
            }
        }
    });

    socket.on('attack', (data) => {
        const p = players[socket.id];
        if (!p) return;

        const angle = Math.atan2(data.y - p.y, data.x - p.x);
        const damage = p.str * GEAR_DATA.sword[p.gear.sword];

        for (const m of monsters) {
            if (!m.isAlive || m.room !== p.room) continue;

            if (Math.hypot(p.x - m.x, p.y - m.y) < 140) {
                m.hp -= damage;

                if (m.hp <= 0) {
                    m.isAlive = false;

                    p.gold += m.gold;
                    giveXP(p, m.isBoss ? 500 : 50);

                    setTimeout(() => {
                        m.isAlive = true;
                        m.hp = m.maxHp;
                    }, 12000);
                }
            }
        }

        projectiles.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * 18,
            vy: Math.sin(angle) * 18,
            room: p.room,
            owner: socket.id,
            damage
        });
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p) {
            users[p.name] = {
                ...users[p.name],
                gold: p.gold,
                skillPoints: p.skillPoints,
                upgrades: p.upgrades,
                gear: p.gear
            };
            delete players[socket.id];
        }
    });
});

// ===================== GAME LOOP =====================
setInterval(() => {

    for (const p of Object.values(players)) {

        p.mana = Math.min(p.maxMana, p.mana + 0.5);

        for (const m of monsters) {
            if (!m.isAlive || m.room !== p.room) continue;

            const dist = Math.hypot(p.x - m.x, p.y - m.y);

            if (dist < 500) {
                const ang = Math.atan2(p.y - m.y, p.x - m.x);

                m.x += Math.cos(ang) * m.spd;
                m.y += Math.sin(ang) * m.spd;

                if (dist < 60) {
                    p.hp -= m.str;

                    if (p.hp <= 0) respawn(p);
                }
            }
        }
    }

    // projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];

        pr.x += pr.vx;
        pr.y += pr.vy;

        for (const m of monsters) {
            if (!m.isAlive || m.room !== pr.room) continue;

            if (Math.hypot(pr.x - m.x, pr.y - m.y) < 50) {
                m.hp -= pr.damage;
                projectiles.splice(i, 1);
                break;
            }
        }
    }

    io.emit('update', { players, monsters, projectiles });

}, TICK_RATE);

http.listen(3000, () => console.log("Server running"));
