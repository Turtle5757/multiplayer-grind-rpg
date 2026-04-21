const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior';
let camX = 0, camY = 0; 
let zoom = 0.7; // Change this to 0.5 to see even more, or 1.0 to see less.
const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

// --- FULLSCREEN RESIZE ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- UI & CHAT ---
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

// --- INPUTS ---
window.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        if (document.activeElement === chatInput) {
            if (chatInput.value.trim()) socket.emit('chat', chatInput.value);
            chatInput.value = ""; chatInput.blur();
        } else {
            chatInput.focus();
        }
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
    // Adjusted for Zoom and Fullscreen
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

    // Camera Math considering zoom
    camX = me.x - (canvas.width / 2) / zoom;
    camY = me.y - (canvas.height / 2) / zoom;

    // Clamp Camera
    camX = Math.max(0, Math.min(camX, WORLD_SIZE - canvas.width / zoom));
    camY = Math.max(0, Math.min(camY, WORLD_SIZE - canvas.height / zoom));

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(zoom, zoom); 
    ctx.translate(-camX, -camY);

    // 1. Background
    ctx.fillStyle = rooms[me.room].bg;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for(let i=0; i<=WORLD_SIZE; i+=200) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, WORLD_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(WORLD_SIZE, i); ctx.stroke();
    }

    // 2. Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 60, 25, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.font = "bold 20px Arial";
            ctx.textAlign = "center"; ctx.fillText(pt.label, pt.x, pt.y - 50);
        }
    });

    // 3. Monsters & Boss
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            if (m.isBoss) {
                const pulse = 60 + Math.sin(Date.now() / 150) * 12;
                ctx.fillStyle = '#8e44ad';
                ctx.beginPath(); ctx.arc(m.x, m.y, pulse, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = "white"; ctx.lineWidth = 5; ctx.stroke();
                ctx.fillStyle = "white"; ctx.font = "bold 24px Arial";
                ctx.fillText("WORLD BOSS", m.x, m.y - pulse - 40);
            } else {
                ctx.fillStyle = '#f44336';
                ctx.beginPath(); ctx.arc(m.x, m.y, 30, 0, Math.PI * 2); ctx.fill();
            }
            const bw = m.isBoss ? 150 : 60;
            ctx.fillStyle = "black"; ctx.fillRect(m.x - bw/2, m.y - 75, bw, 10);
            ctx.fillStyle = "red"; ctx.fillRect(m.x - bw/2, m.y - 75, (m.hp / m.maxHp) * bw, 10);
        }
    });

    // 4. Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
    });

    // 5. Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') ctx.fillRect(p.x-20, p.y-20, 40, 40);
            else if (p.charClass === 'Archer') { ctx.beginPath(); ctx.moveTo(p.x, p.y-25); ctx.lineTo(p.x-25, p.y+20); ctx.lineTo(p.x+25, p.y+20); ctx.fill(); }
            else { ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI*2); ctx.fill(); }

            ctx.fillStyle = 'white'; ctx.font = "bold 18px Arial"; ctx.textAlign = "center";
            ctx.fillText(p.name, p.x, p.y - 60);

            ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(p.x-30, p.y-52, 60, 8);
            ctx.fillStyle = (id === myId) ? "#00ff00" : "#ffcc00";
            ctx.fillRect(p.x-30, p.y-52, (p.hp/p.maxHp)*60, 8);
        }
    }

    ctx.restore(); 
    requestAnimationFrame(draw);
}
