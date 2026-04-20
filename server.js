const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let monsters = [
    { id: 1, x: 400, y: 300, hp: 100, maxHp: 100, str: 8, room: 'dungeon', isAlive: true },
    { id: 2, x: 200, y: 500, hp: 250, maxHp: 250, str: 15, room: 'dungeon', isAlive: true }
];

const rooms = {
    hub: { name: "Main Village", color: "#15220d" },
    gym: { name: "The Iron Gym", color: "#222", stat: 'str', rate: 0.1 },
    track: { name: "Speedway", color: "#3d2b1f", stat: 'spd', rate: 0.005 },
    lake: { name: "Zen Lake", color: "#001f3f", stat: 'def', rate: 0.05 },
    dungeon: { name: "Monster Dungeon", color: "#1a0000" }
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        players[socket.id] = {
            x: 400, y: 300, room: 'hub',
            hp: data.hp || 100, maxHp: data.maxHp || 100,
            level: data.level || 1, xp: data.xp || 0, nextLevel: data.nextLevel || 100,
            str: data.str || 10, def: data.def || 5, spd: data.spd || 3,
            gold: data.gold || 0, name: data.name || "Noob",
            password: data.password, // Store for local saving
            color: data.color || `hsl(${Math.random() * 360}, 70%, 50%)`
        };
        socket.emit('init', { id: socket.id, players, monsters, rooms });
    });

    socket.on('move', (keys) => {
        const p = players[socket.id];
        if (!p) return;

        if (keys.w) p.y -= p.spd;
        if (keys.s) p.y += p.spd;
        if (keys.a) p.x -= p.spd;
        if (keys.d) p.x += p.spd;

        // Room Transitions
        if (p.room === 'hub') {
            if (p.y < 0) { p.room = 'track'; p.y = 550; }
            if (p.y > 600) { p.room = 'gym'; p.y = 50; }
            if (p.x < 0) { p.room = 'lake'; p.x = 750; }
            if (p.x > 800) { p.room = 'dungeon'; p.x = 50; }
        } else {
            if (p.y > 600 && p.room === 'track') { p.room = 'hub'; p.y = 50; }
            if (p.y < 0 && p.room === 'gym') { p.room = 'hub'; p.y = 550; }
            if (p.x > 800 && p.room === 'lake') { p.room = 'hub'; p.x = 50; }
            if (p.x < 0 && p.room === 'dungeon') { p.room = 'hub'; p.x = 750; }
        }

        const roomData = rooms[p.room];
        if (roomData && roomData.stat) p[roomData.stat] += roomData.rate;
        io.emit('update', { players, monsters });
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p) return;
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
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('update', { players, monsters }); });
});

setInterval(() => {
    monsters.forEach(m => {
        if (!m.isAlive) return;
        let target = null; let minDist = 300;
        for (let id in players) {
            let p = players[id];
            if (p.room === m.room) {
                let d = Math.hypot(p.x - m.x, p.y - m.y);
                if (d < minDist) { minDist = d; target = p; }
            }
        }
        if (target) {
            let angle = Math.atan2(target.y - m.y, target.x - m.x);
            m.x += Math.cos(angle) * 1.5; m.y += Math.sin(angle) * 1.5;
            if (minDist < 30) {
                target.hp -= Math.max(0.1, (m.str - target.def) / 10);
                if (target.hp <= 0) { target.hp = target.maxHp; target.room = 'hub'; target.x = 400; target.y = 300; }
            }
        }
    });
    io.emit('update', { players, monsters });
}, 50);

server.listen(process.env.PORT || 3000);
