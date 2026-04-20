const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs'); // To save files

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- GLOBAL DATABASE LOGIC ---
let db = { users: {} };
const DB_PATH = './users.json';

// Load existing users from file if it exists
if (fs.existsSync(DB_PATH)) {
    db = JSON.parse(fs.readFileSync(DB_PATH));
}

function saveDB() {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
// -----------------------------

let players = {};
let monsters = [
    { id: 1, x: 400, y: 300, hp: 100, maxHp: 100, str: 8, room: 'dungeon', isAlive: true },
    { id: 2, x: 200, y: 500, hp: 250, maxHp: 250, str: 15, room: 'dungeon', isAlive: true }
];

const rooms = {
    hub: { name: "Main Village", color: "#15220d", pvp: false },
    gym: { name: "The Iron Gym", color: "#222", stat: 'str', rate: 0.1, pvp: false },
    track: { name: "Speedway", color: "#3d2b1f", stat: 'spd', rate: 0.005, pvp: false },
    lake: { name: "Zen Lake", color: "#001f3f", stat: 'def', rate: 0.05, pvp: false },
    dungeon: { name: "Monster Dungeon", color: "#1a0000", pvp: false },
    arena: { name: "PVP ARENA", color: "#4a0000", pvp: true }
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const username = data.name.toLowerCase();
        
        // If user exists, check password
        if (db.users[username]) {
            if (db.users[username].password !== data.password) {
                socket.emit('loginError', 'Wrong password!');
                return;
            }
            // Load their saved stats
            players[socket.id] = { ...db.users[username], x: 400, y: 300, room: 'hub' };
        } else {
            // Create new account in DB
            const newAcc = {
                name: data.name,
                password: data.password,
                level: 1, hp: 100, maxHp: 100, xp: 0, nextLevel: 100,
                str: 10, def: 5, spd: 3, gold: 0,
                color: `hsl(${Math.random() * 360}, 70%, 50%)`
            };
            db.users[username] = newAcc;
            saveDB();
            players[socket.id] = { ...newAcc, x: 400, y: 300, room: 'hub' };
        }
        
        socket.emit('init', { id: socket.id, players, monsters, rooms });
    });

    socket.on('move', (keys) => {
        const p = players[socket.id];
        if (!p) return;

        if (keys.w) p.y -= p.spd;
        if (keys.s) p.y += p.spd;
        if (keys.a) p.x -= p.spd;
        if (keys.d) p.x += p.spd;

        // Transitions
        if (p.room === 'hub') {
            if (p.y < 0) { p.room = 'track'; p.y = 550; }
            if (p.y > 600) { p.room = 'gym'; p.y = 50; }
            if (p.x < 0) { p.room = 'lake'; p.x = 750; }
            if (p.x > 800) { p.room = 'dungeon'; p.x = 50; }
        } else if (p.room === 'gym' && p.y > 600) {
            p.room = 'arena'; p.y = 50;
        } else {
            if (p.y > 600 && p.room === 'track') { p.room = 'hub'; p.y = 50; }
            if (p.y < 0 && (p.room === 'gym' || p.room === 'arena')) { p.room = 'hub'; p.y = 550; }
            if (p.x > 800 && p.room === 'lake') { p.room = 'hub'; p.x = 50; }
            if (p.x < 0 && p.room === 'dungeon') { p.room = 'hub'; p.x = 750; }
        }

        const rd = rooms[p.room];
        if (rd && rd.stat) p[rd.stat] += rd.rate;
        io.emit('update', { players, monsters });
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p) return;
        
        // Monster hit
        monsters.forEach(m => {
            if (m.room === p.room && m.isAlive && Math.hypot(p.x - m.x, p.y - m.y) < 60) {
                m.hp -= p.str / 5;
                if (m.hp <= 0) {
                    m.isAlive = false; p.xp += 50; p.gold += 25;
                    if (p.xp >= p.nextLevel) {
                        p.level++; p.xp = 0; p.nextLevel *= 1.5; p.maxHp += 20; p.hp = p.maxHp;
                    }
                    setTimeout(() => { m.hp = m.maxHp; m.isAlive = true; }, 5000);
                }
            }
        });

        // PvP hit
        if (rooms[p.room].pvp) {
            for (let id in players) {
                if (id === socket.id) continue;
                let t = players[id];
                if (t.room === p.room && Math.hypot(p.x - t.x, p.y - t.y) < 50) {
                    t.hp -= Math.max(1, p.str - t.def);
                    if (t.hp <= 0) {
                        p.gold += Math.floor(t.gold * 0.2);
                        t.gold = Math.floor(t.gold * 0.8);
                        t.hp = t.maxHp; t.room = 'hub'; t.x = 400; t.y = 300;
                    }
                }
            }
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            // Save their progress to the global DB file before removing them
            const username = players[socket.id].name.toLowerCase();
            db.users[username] = { ...players[socket.id] };
            delete db.users[username].x; // Don't save temporary position
            delete db.users[username].y;
            delete db.users[username].room;
            saveDB();
        }
        delete players[socket.id];
        io.emit('update', { players, monsters });
    });
});

// Periodic global save just in case
setInterval(saveDB, 60000);

server.listen(process.env.PORT || 3000);
