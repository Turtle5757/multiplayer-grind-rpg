const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior';
let camX = 0, camY = 0; 
let zoom = 0.8; 
const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

// --- FULLSCREEN LOGIC ---
function resize() {
    // This makes the canvas internal resolution match your actual monitor size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize(); // Call it immediately

// --- ZOOM CONTROLLER ---
window.addEventListener('wheel', (e) => {
    if (e.deltaY > 0) zoom = Math.max(0.3, zoom - 0.05);
    else zoom = Math.min(1.5, zoom + 0.05);
});

// --- UI & INPUTS ---
const chatInput = document.getElementById('chat-input');
const chatBox = document.getElementById('chat-box');

function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(c).classList.add('active');
}

function startGame() {
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!name || !pass) return;
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

window.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        if (document.activeElement === chatInput) {
            if (chatInput.value.trim()) socket.emit('chat', chatInput.value);
            chatInput.value = ""; chatInput.blur();
        } else { chatInput.focus(); }
        return;
    }
    if (document.activeElement === chatInput) return;
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', e => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousedown', (e) => {
    if (!isPlaying) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / zoom + camX;
    const mouseY = (e.clientY - rect.top) / zoom + camY;
    socket.emit('attack', { x: mouseX, y: mouseY });
});

// --- SOCKETS ---
socket.on('init', data => {
    myId = data.id; rooms = data.rooms; portals = data.portals;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true; 
    requestAnimationFrame(draw);
});

socket.on('msg', (text) => {
    const m = document.createElement('div');
    m.innerText = text;
    chatBox.appendChild(m);
    chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on('update', data => {
    players = data.players;
    monsters = data.monsters;
    projectiles = data.projectiles || [];
    
    if (players[myId]) {
        const me = players[myId];
        document.getElementById('p-class').innerText = me.charClass.toUpperCase();
        document.getElementById('lvl').innerText = me.level;
        document.getElementById('str').innerText = Math.floor(me.str);
        document.getElementById('def').innerText = Math.floor(me.def);
        document.getElementById('spd').innerText = me.spd.toFixed(1);
        document.getElementById('gold-display').innerText = me.gold;
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
    }
});

setInterval(() => { if (isPlaying) socket.emit('move', keys); }, 30);

// --- RENDER ---
function draw() {
    if (!isPlaying || !players[myId]) {
        requestAnimationFrame(draw);
        return;
    }

    const me = players[myId];

    // 1. Calculate the visible width/height based on zoom
    const visibleWidth = canvas.width / zoom;
    const visibleHeight = canvas.height / zoom;

    // 2. Camera follows player
    camX = me.x - visibleWidth / 2;
    camY = me.y - visibleHeight / 2;

    // 3. Keep camera in bounds
    if (visibleWidth >= WORLD_SIZE) camX = (WORLD_SIZE - visibleWidth) / 2;
    else camX = Math.max(0, Math.min(camX, WORLD_SIZE - visibleWidth));

    if (visibleHeight >= WORLD_SIZE) camY = (WORLD_SIZE - visibleHeight) / 2;
    else camY = Math.max(0, Math.min(camY, WORLD_SIZE - visibleHeight));

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(zoom, zoom); 
    ctx.translate(-camX, -camY);

    // DRAW BACKGROUND
    ctx.fillStyle = rooms[me.room].bg;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // GRID
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for(let i=0; i<=WORLD_SIZE; i+=200) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, WORLD_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(WORLD_SIZE, i); ctx.stroke();
    }

    // DRAW PORTALS
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 60, 25, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.font = "bold 22px Arial";
            ctx.textAlign = "center"; ctx.fillText(pt.label, pt.x, pt.y - 50);
        }
    });

    // DRAW MONSTERS
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            if (m.isBoss) {
                const pulse = 65 + Math.sin(Date.now() / 150) * 15;
                ctx.fillStyle = '#8e44ad';
                ctx.beginPath(); ctx.arc(m.x, m.y, pulse, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = "white"; ctx.lineWidth = 5; ctx.stroke();
            } else {
                ctx.fillStyle = '#f44336';
                ctx.beginPath(); ctx.arc(m.x, m.y, 30, 0, Math.PI * 2); ctx.fill();
            }
            const bw = m.isBoss ? 160 : 60;
            ctx.fillStyle = "black"; ctx.fillRect(m.x - bw/2, m.y - 80, bw, 12);
            ctx.fillStyle = "red"; ctx.fillRect(m.x - bw/2, m.y - 80, (m.hp / m.maxHp) * bw, 12);
        }
    });

    // DRAW PROJECTILES
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
    });

    // DRAW PLAYERS
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') ctx.fillRect(p.x-22, p.y-22, 44, 44);
            else if (p.charClass === 'Archer') { ctx.beginPath(); ctx.moveTo(p.x, p.y-28); ctx.lineTo(p.x-28, p.y+22); ctx.lineTo(p.x+28, p.y+22); ctx.fill(); }
            else { ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI*2); ctx.fill(); }

            ctx.fillStyle = 'white'; ctx.font = "bold 18px Arial"; ctx.textAlign = "center";
            ctx.fillText(p.name, p.x, p.y - 65);
            ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(p.x-35, p.y-55, 70, 10);
            ctx.fillStyle = (id === myId) ? "#00ff00" : "#ffcc00";
            ctx.fillRect(p.x-35, p.y-55, (p.hp/p.maxHp)*70, 10);
        }
    }

    ctx.restore(); 
    requestAnimationFrame(draw);
}
