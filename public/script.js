const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

canvas.width = 800;
canvas.height = 600;

// --- UI & CHAT ---
const chatInput = document.getElementById('chat-input');
const chatBox = document.getElementById('chat-box');

function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(c).classList.add('active');
}

function startGame() {
    socket.emit('login', { 
        name: document.getElementById('username').value, 
        password: document.getElementById('password').value, 
        charClass: selectedClass 
    });
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    socket.emit('attack', { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY });
});

// --- SOCKETS ---
socket.on('init', data => {
    myId = data.id; rooms = data.rooms; portals = data.portals;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true; requestAnimationFrame(draw);
});

socket.on('msg', (text) => {
    const m = document.createElement('div');
    m.innerText = text;
    chatBox.appendChild(m);
    chatBox.scrollTop = chatBox.scrollHeight;
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

// --- RENDER ---
function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const me = players[myId];
    ctx.fillStyle = rooms[me.room].bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";

    // Portals
    portals.forEach(pt => { if (pt.fromRoom === me.room) {
        ctx.fillStyle = pt.color; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 35, 15, 0, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.font = "12px Arial"; ctx.fillText(pt.label, pt.x, pt.y - 30);
    }});

    // Monsters & Boss
    monsters.forEach(m => { if (m.room === me.room && m.isAlive) {
        if (m.isBoss) {
            const pulse = 45 + Math.sin(Date.now() / 150) * 8;
            ctx.fillStyle = '#8e44ad'; ctx.beginPath(); ctx.arc(m.x, m.y, pulse, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
        } else {
            ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI*2); ctx.fill();
        }
        const bw = m.isBoss ? 100 : 40;
        ctx.fillStyle = "black"; ctx.fillRect(m.x - bw/2, m.y - 50, bw, 6);
        ctx.fillStyle = "red"; ctx.fillRect(m.x - bw/2, m.y - 50, (m.hp / m.maxHp) * bw, 6);
    }});

    // Projectiles
    projectiles.forEach(p => { if (p.room === me.room) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); }});

    // Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') ctx.fillRect(p.x-15, p.y-15, 30, 30);
            else if (p.charClass === 'Archer') { ctx.beginPath(); ctx.moveTo(p.x, p.y-18); ctx.lineTo(p.x-18, p.y+15); ctx.lineTo(p.x+18, p.y+15); ctx.fill(); }
            else { ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI*2); ctx.fill(); }
            
            ctx.fillStyle = "white"; ctx.font = "14px Arial"; ctx.fillText(p.name, p.x, p.y - 40);
            ctx.fillStyle = "black"; ctx.fillRect(p.x-20, p.y-34, 40, 5);
            ctx.fillStyle = (id === myId) ? "#00ff00" : "#ffcc00";
            ctx.fillRect(p.x-20, p.y-34, (p.hp/p.maxHp)*40, 5);

            if (id === myId) {
                ctx.fillStyle = "cyan"; ctx.font = "bold 15px Arial";
                if (me.room === 'gym') ctx.fillText("CLICK TO TRAIN STR", p.x, p.y+50);
                if (me.room === 'track') ctx.fillText("RUN TO TRAIN SPEED", p.x, p.y+50);
                if (me.room === 'lake') ctx.fillText("STILL TO TRAIN DEFENSE", p.x, p.y+50);
            }
        }
    }
    requestAnimationFrame(draw);
}
