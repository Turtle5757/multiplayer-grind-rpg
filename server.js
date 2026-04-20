const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let monsters = [
    { id: 1, x: 500, y: 500, hp: 100, maxHp: 100, str: 5 },
    { id: 2, x: 800, y: 300, hp: 200, maxHp: 200, str: 8 }
];

io.on('connection', (socket) => {
    socket.on('login', (userData) => {
        players[socket.id] = {
            x: 200, y: 200,
            hp: userData.hp || 100, 
            maxHp: userData.maxHp || 100,
            level: userData.level || 1, 
            xp: userData.xp || 0, 
            nextLevel: userData.nextLevel || 100,
            str: userData.str || 10, 
            def: userData.def || 5, // Train by taking damage
            spd: userData.spd || 3, // Train by walking
            gold: userData.gold || 0,
            name: userData.name,
            color: userData.color || `hsl(${Math.random() * 360}, 70%, 50%)`
        };
        socket.emit('init', { id: socket.id, players, monsters });
    });

    socket.on('move', (dir) => {
        const p = players[socket.id];
        if (!p) return;
        
        // Move based on WASD keys sent from client
        if (dir.w) p.y -= p.spd;
        if (dir.s) p.y += p.spd;
        if (dir.a) p.x -= p.spd;
        if (dir.d) p.x += p.spd;

        // Train Speed by walking (1% chance per move)
        if (Math.random() > 0.99) {
            p.spd += 0.05;
        }

        io.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, spd: p.spd });
    });

    socket.on('attack', () => {
        const p = players[socket.id];
        if (!p) return;
        monsters.forEach(m => {
            const dist = Math.hypot(p.x - m.x, p.y - m.y);
            if (dist < 60) {
                m.hp -= (p.str / 2); // Manual attack
                if (m.hp <= 0) {
                    m.hp = m.maxHp;
                    p.xp += 30;
                    p.gold += 20;
                    checkLevelUp(p);
                }
            }
        });
        io.emit('updateData', { players, monsters });
    });
});

function checkLevelUp(p) {
    if (p.xp >= p.nextLevel) {
        p.level++;
        p.xp = 0;
        p.nextLevel = Math.floor(p.nextLevel * 1.4);
        p.str += 2;
        p.maxHp += 10;
        p.hp = p.maxHp;
    }
}

// Monster AI with Defense Training
setInterval(() => {
    monsters.forEach(m => {
        let closest = null;
        let minDist = 350;
        for (let id in players) {
            let d = Math.hypot(players[id].x - m.x, players[id].y - m.y);
            if (d < minDist) { minDist = d; closest = players[id]; }
        }

        if (closest) {
            let angle = Math.atan2(closest.y - m.y, closest.x - m.x);
            m.x += Math.cos(angle) * 1.8;
            m.y += Math.sin(angle) * 1.8;

            if (minDist < 30) {
                // Damage calculation: MonsterStr - PlayerDef
                let damage = Math.max(0.1, (m.str - closest.def) / 10);
                closest.hp -= damage;
                
                // Train Defense by surviving hits
                if (Math.random() > 0.98) closest.def += 0.1;

                if (closest.hp <= 0) {
                    closest.hp = closest.maxHp;
                    closest.x = 100; closest.y = 100;
                    closest.gold = Math.floor(closest.gold * 0.8);
                }
            }
        }
    });
    io.emit('updateData', { players, monsters });
}, 50);

server.listen(process.env.PORT || 3000);
