const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

canvas.width = 800; canvas.height = 600;

function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(c).classList.add('active');
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

window.addEventListener('keydown', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousedown', (e) => {
    if (!isPlaying) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    socket.emit('attack', { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY });
});

function startGame() {
    socket.emit('login', { name: document.getElementById('username').value, password: document.getElementById('password').value, charClass: selectedClass });
}

socket.on('init', data => {
    myId = data.id; rooms = data.rooms; portals = data.portals;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true; requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players; monsters = data.monsters; projectiles = data.projectiles || [];
    if (players[myId]) {
        const me = players[myId];
        document.getElementById('str').innerText = Math.floor(me.str);
        document.getElementById('def').innerText = Math.floor(me.def);
        document.getElementById('spd').innerText = me.spd.toFixed(1);
        document.getElementById('gold-display').innerText = me.gold;
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
    }
});

setInterval(() => { if (isPlaying) socket.emit('move', keys); }, 30);

function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const me = players[myId];
    ctx.fillStyle = rooms[me.room].bg; ctx.fillRect(0, 0, canvas.width, canvas.height);

    portals.forEach(pt => { if (pt.fromRoom === me.room) {
        ctx.fillStyle = pt.color; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 35, 15, 0, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.fillText(pt.label, pt.x, pt.y - 30);
    }});

    projectiles.forEach(p => { if (p.room === me.room) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); }});
    monsters.forEach(m => { if (m.room === me.room && m.isAlive) { ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI*2); ctx.fill(); }});

    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') ctx.fillRect(p.x-15, p.y-15, 30, 30);
            else if (p.charClass === 'Archer') { ctx.beginPath(); ctx.moveTo(p.x, p.y-18); ctx.lineTo(p.x-18, p.y+15); ctx.lineTo(p.x+18, p.y+15); ctx.fill(); }
            else { ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI*2); ctx.fill(); }
            ctx.fillStyle = 'white'; ctx.fillText(p.name, p.x, p.y-25);
        }
    }
    requestAnimationFrame(draw);
}
