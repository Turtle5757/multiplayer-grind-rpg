const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let monsters = [
    { id: 1, x: 400, y: 400, hp: 100, maxHp: 100, str: 2 },
    { id: 2, x: 600, y: 200, hp: 150, maxHp: 150, str: 4 }
];

io.on('connection', (socket) => {
    players[socket.id] = {
        x: 100, y: 100,
        hp: 100, maxHp: 100,
        level: 1, xp: 0, nextLevel: 100,
        str: 10, gold: 0,
        name: `Player ${socket.id.substring(0, 4)}`,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`
    };

    socket.emit('init', { id: socket.id, players, monsters });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
        }
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        monsters.forEach(m => {
            const dist = Math.hypot(p.x - m.x, p.y - m.y);
            if (dist < 60) {
                m.hp -= p.str;
                if (m.hp <= 0) {
                    m.hp = m.maxHp;
                    p.xp += 25;
                    p.gold += 10;
                    if (p.xp >= p.nextLevel) {
                        p.level++;
                        p.xp = 0;
                        p.nextLevel = Math.floor(p.nextLevel * 1.5);
                        p.str += 5;
                        p.maxHp += 20;
                        p.hp = p.maxHp;
                    }
                }
            }
        });
        io.emit('updateData', { players, monsters });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

// Monster AI Loop
setInterval(() => {
    monsters.forEach(m => {
        let closest = null;
        let minDist = 400;

        for (let id in players) {
            let d = Math.hypot(players[id].x - m.x, players[id].y - m.y);
            if (d < minDist) { minDist = d; closest = players[id]; }
        }

        if (closest) {
            let angle = Math.atan2(closest.y - m.y, closest.x - m.x);
            m.x += Math.cos(angle) * 1.5;
            m.y += Math.sin(angle) * 1.5;

            if (minDist < 30) {
                closest.hp -= m.str / 10; // Rapid small damage
                if (closest.hp <= 0) {
                    closest.hp = closest.maxHp;
                    closest.x = 100; closest.y = 100;
                    closest.gold = Math.floor(closest.gold * 0.9); // 10% gold penalty
                }
            }
        }
    });
    io.emit('updateData', { players, monsters });
}, 50);

server.listen(process.env.PORT || 3000);
