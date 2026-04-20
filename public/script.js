const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let myId, players = {}, monsters = [], rooms = {}, isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousedown', () => { if(isPlaying) socket.emit('attack'); });

function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.style.border = "none");
    document.getElementById(c).style.border = "2px solid white";
}

function startGame() {
    const name = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    if (!name || !pass) return;
    socket.emit('login', { name: name, password: pass, charClass: selectedClass });
}

socket.on('init', data => {
    myId = data.id;
    players = data.players;
    monsters = data.monsters;
    rooms = data.rooms;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true;
    requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players; monsters = data.monsters;
    if (isPlaying && players[myId]) {
        const me = players[myId];
        document.getElementById('charClass').innerText = me.charClass.toUpperCase();
        document.getElementById('lvl').innerText = me.level;
        document.getElementById('str').innerText = Math.floor(me.str);
        document.getElementById('gold').innerText = me.gold;
        document.getElementById('hp-fill').style.width = (me.hp/me.maxHp*100) + "%";
        document.getElementById('xp-fill').style.width = (me.xp/me.nextLevel*100) + "%";
    }
});

setInterval(() => { if(isPlaying) socket.emit('move', keys); }, 30);

function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const myRoomKey = players[myId].room;
    const roomData = rooms[myRoomKey];

    ctx.fillStyle = roomData.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    monsters.forEach(m => {
        if (m.room === myRoomKey && m.isAlive) {
            ctx.fillStyle = '#ff4444';
            ctx.beginPath(); ctx.arc(m.x, m.y, 25, 0, Math.PI*2); ctx.fill();
        }
    });

    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            ctx.fillStyle = p.color;
            // Draw different shapes for different classes
            if (p.charClass === 'Warrior') ctx.fillRect(p.x - 15, p.y - 15, 30, 30); // Blocky
            if (p.charClass === 'Archer') { // Triangle
                ctx.beginPath(); ctx.moveTo(p.x, p.y - 20); ctx.lineTo(p.x - 15, p.y + 15); ctx.lineTo(p.x + 15, p.y + 15); ctx.fill();
            }
            if (p.charClass === 'Mage') { // Diamond
                ctx.beginPath(); ctx.moveTo(p.x, p.y - 20); ctx.lineTo(p.x + 15, p.y); ctx.lineTo(p.x, p.y + 20); ctx.lineTo(p.x - 15, p.y); ctx.fill();
            }
            ctx.fillStyle = 'white';
            ctx.fillText(p.name, p.x, p.y - 25);
        }
    }
    requestAnimationFrame(draw);
}
