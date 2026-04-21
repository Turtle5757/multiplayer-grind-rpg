const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior';
let camX = 0, camY = 0; // Camera coordinates
const WORLD_SIZE = 2000;
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
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!name || !pass) return alert("Enter credentials!");
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

// --- INPUT HANDLING ---
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
    
    // Crucial: Add camX/camY so the server knows where in the world you aimed
    const mouseX = (e.clientX - rect.left) * scaleX + camX;
    const mouseY = (e.clientY - rect.top) * scaleY + camY;
    socket.emit('attack', { x: mouseX, y: mouseY });
});

// --- SOCKET EVENTS ---
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

// Movement Tick
setInterval(() => { if (isPlaying) socket.emit('move', keys); }, 30);

// --- MAIN RENDER LOOP ---
function draw() {
    if (!isPlaying || !players[myId]) {
        requestAnimationFrame(draw);
        return;
    }

    const me = players[myId];

    // Update Camera to follow player
    camX = me.x - canvas.width / 2;
    camY = me.y - canvas.height / 2;

    // Clamp camera so it doesn't show the "void" outside the world
    camX = Math.max(0, Math.min(camX, WORLD_SIZE - canvas.width));
    camY = Math.max(0, Math.min(camY, WORLD_SIZE - canvas.height));

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camX, -camY); // Shift world by camera amount

    // 1. Background
    ctx.fillStyle = rooms[me.room].bg;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Simple Grid to show scale
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 2;
    for(let i=0; i<=WORLD_SIZE; i+=200) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, WORLD_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(WORLD_SIZE, i); ctx.stroke();
    }

    // 2. Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.ellipse(pt.x, pt.y, 50, 20, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = "white";
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(pt.label, pt.x, pt.y - 40);
        }
    });

    // 3. Monsters & Boss
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            if (m.isBoss) {
                const pulse = 50 + Math.sin(Date.now() / 150) * 10;
                ctx.fillStyle = '#8e44ad';
                ctx.beginPath(); ctx.arc(m.x, m.y, pulse, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = "white"; ctx.lineWidth = 4; ctx.stroke();
                ctx.fillStyle = "white"; ctx.font = "bold 18px Arial";
                ctx.fillText("WORLD BOSS", m.x, m.y - pulse - 30);
            } else {
                ctx.fillStyle = '#f44336';
                ctx.beginPath(); ctx.arc(m.x, m.y, 25, 0, Math.PI * 2); ctx.fill();
            }
            
            // HP Bar for Monsters
            const bw = m.isBoss ? 120 : 50;
            ctx.fillStyle = "black"; ctx.fillRect(m.x - bw/2, m.y - 60, bw, 8);
            ctx.fillStyle = "red"; ctx.fillRect(m.x - bw/2, m.y - 60, (m.hp / m.maxHp) * bw, 8);
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
            if (p.charClass === 'Warrior') {
                ctx.fillRect(p.x - 18, p.y - 18, 36, 36);
            } else if (p.charClass === 'Archer') {
                ctx.beginPath(); ctx.moveTo(p.x, p.y - 22); ctx.lineTo(p.x - 22, p.y + 18); ctx.lineTo(p.x + 22, p.y + 18); ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.fill();
            }

            ctx.fillStyle = 'white';
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(p.name, p.x, p.y - 50);

            // Floating Player HP Bar
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(p.x - 25, p.y - 42, 50, 6);
            ctx.fillStyle = (id === myId) ? "#00ff00" : "#ffcc00";
            ctx.fillRect(p.x - 25, p.y - 42, (p.hp / p.maxHp) * 50, 6);

            // Training Prompts
            if (id === myId) {
                ctx.fillStyle = "cyan";
                ctx.font = "bold 16px Arial";
                if (me.room === 'gym') ctx.fillText("CLICK TO TRAIN STRENGTH", p.x, p.y + 60);
                if (me.room === 'track') ctx.fillText("RUN TO TRAIN SPEED", p.x, p.y + 60);
                if (me.room === 'lake') ctx.fillText("STAY STILL TO TRAIN DEFENSE", p.x, p.y + 60);
            }
        }
    }

    ctx.restore(); // Stop translation

    requestAnimationFrame(draw);
}
