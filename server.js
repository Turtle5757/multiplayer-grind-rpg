const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let monsters = [
    { id: 1, x: 400, y: 600, hp: 100, maxHp: 100, str: 8 },
    { id: 2, x: 700, y: 700, hp: 250, maxHp: 250, str: 15 }
];

const zones = {
    gym: { x: 50, y: 350, w: 200, h: 200, stat: 'str', rate: 0.05 },
    track: { x: 500, y: 50, w: 300, h: 300, stat: 'spd', rate: 0.002 },
    lake: { x: 50, y: 50, w: 200, h: 200, stat: 'def', rate: 0.02 },
    shop: { x: 700, y: 450, w: 150, h: 150 }
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        players[socket.id] = {
            x: 400, y: 400,
            hp: data.hp || 100, maxHp: data.maxHp || 100,
            level: data.level || 1, xp: data.xp || 0, nextLevel: data.nextLevel || 100,
            str: data.str || 10, def: data.def || 5, spd: data.spd || 3,
            gold: data.gold || 0, name: data.name || "Noob",
            color: data.color || `hsl(${Math.random() * 360}, 70%, 50%)`,
            currentZone: null
        };
        socket.emit('init', { id: socket.id, players, monsters, zones });
    });

    socket.on('move', (keys) => {
        const p = players[socket.id];
        if (!p) return;

        if (keys.w) p.y -= p.spd;
        if (keys.s) p.y += p.spd;
        if (keys.a) p.x -= p.spd;
        if (keys.d) p.x += p.spd;

        p.currentZone = null;
        for (let key in zones) {
            let z = zones[key];
            if (p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h) {
                p.currentZone = key;
                if (z.stat) p[z.stat] += z.rate;
            }
        }
        io.emit('update', { players, monsters });
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p) return;
        monsters.forEach(m => {
            if (Math.hypot(p.x - m.x, p.y - m.y) < 60) {
                m.hp -= p.str / 5;
                if (m.hp <= 0) {
                    m.hp = m.maxHp; p.xp += 40; p.gold += 15;
                    if (p.xp >= p.nextLevel) {
                        p.level++; p.xp = 0; p.nextLevel *= 1.5; p.maxHp += 20; p.hp = p.maxHp;
                    }
                }
            }
        });
    });

    socket.on('purchase', (item) => {
        const p = players[socket.id];
        if (!p || p.currentZone !== 'shop') return;
        if (item === 'str' && p.gold >= 50) { p.gold -= 50; p.str += 10; }
        if (item === 'hp' && p.gold >= 100) { p.gold -= 100; p.maxHp += 50; p.hp = p.maxHp; }
        socket.emit('update', { players, monsters });
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('update', { players, monsters }); });
});

setInterval(() => {
    monsters.forEach(m => {
        let target = null; let minDist = 300;
        for (let id in players) {
            let d = Math.hypot(players[id].x - m.x, players[id].y - m.y);
            if (d < minDist) { minDist = d; target = players[id]; }
        }
        if (target) {
            let angle = Math.atan2(target.y - m.y, target.x - m.x);
            m.x += Math.cos(angle) * 1.5; m.y += Math.sin(angle) * 1.5;
            if (minDist < 30) {
                target.hp -= Math.max(0.1, (m.str - target.def) / 10);
                if (target.hp <= 0) { target.hp = target.maxHp; target.x = 400; target.y = 400; }
            }
        }
    });
    io.emit('update', { players, monsters });
}, 50);

server.listen(process.env.PORT || 3000);
