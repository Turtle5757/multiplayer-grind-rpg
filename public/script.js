const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GLOBAL STATE ---
let myId;
let players = {};
let monsters = [];
let projectiles = [];
let rooms = {};
let portals = []; 
let isPlaying = false;

// Camera & Viewport
let camX = 0;
let camY = 0;
let zoom = 0.75; 
let mousePos = { x: 0, y: 0 };

const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

// --- INITIALIZATION ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- AUTHENTICATION & UI ---
function setClass(c, event) {
    window.selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    if(event) event.target.classList.add('active');
}

function registerAccount() {
    const name = document.getElementById('log-user').value;
    const pass = document.getElementById('log-pass').value;
    const charClass = window.selectedClass || 'Warrior';
    if(!name || !pass) return alert("Enter name and password");
    socket.emit('register', { name, password: pass, charClass });
}

function loginToAccount() {
    const name = document.getElementById('log-user').value;
    const pass = document.getElementById('log-pass').value;
    if(!name || !pass) return alert("Enter name and password");
    socket.emit('login', { name, password: pass });
}

// --- BLACKSMITH INTERACTION ---
function buyUpgrade(type) {
    socket.emit('buyItem', type);
}

// --- SOCKET LISTENERS ---
socket.on('authMessage', msg => alert(msg));
socket.on('authError', err => alert(err));
socket.on('notification', msg => console.log("Server:", msg));

socket.on('init', d => {
    myId = d.id; 
    rooms = d.rooms; 
    portals = d.portals; 
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true;
    requestAnimationFrame(draw);
});

socket.on('update', d => {
    players = d.players; 
    monsters = d.monsters; 
    projectiles = d.projectiles;
    
    const me = players[myId];
    if (me) {
        // Update HUD
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('energy-fill').style.width = me.energy + "%";
        document.getElementById('gold-display').innerText = Math.floor(me.gold);
        document.getElementById('str-display').innerText = Math.floor(me.str);
        document.getElementById('def-display').innerText = Math.floor(me.def);
        document.getElementById('spd-display').innerText = me.spd.toFixed(1);

        // Toggle Blacksmith UI visibility
        const shopUI = document.getElementById('shop-ui');
        if (shopUI) shopUI.style.display = (me.room === 'shop') ? 'block' : 'none';

        // Cooldowns
        let now = Date.now();
        ['q', 'e'].forEach(k => {
            const cdFill = document.getElementById(`${k}-cd`);
            if (cdFill) {
                const isCooled = me.cooldowns[k.toUpperCase()] && now < me.cooldowns[k.toUpperCase()];
                cdFill.style.height = isCooled ? "100%" : "0%";
            }
        });
    }
});

// --- INPUTS ---
window.addEventListener('mousemove', e => { mousePos.x = e.clientX; mousePos.y = e.clientY; });
window.addEventListener('keydown', e => {
    let k = e.key.toLowerCase();
    if (k === 'q' || k === 'e') socket.emit('useAbility', k.toUpperCase());
    if (keys.hasOwnProperty(k)) keys[k] = true;
});
window.addEventListener('keyup', e => { 
    let k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false; 
});
canvas.addEventListener('mousedown', () => { if (isPlaying) socket.emit('attack'); });

setInterval(() => {
    if (isPlaying && players[myId]) {
        const me = players[myId];
        const worldMouseX = (mousePos.x / zoom) + camX;
        const worldMouseY = (mousePos.y / zoom) + camY;
        const angle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
        socket.emit('move', { keys, angle });
    }
}, 30);

// --- RENDER ---
function draw() {
    if (!isPlaying || !players[myId]) return requestAnimationFrame(draw);

    const me = players[myId];
    const vw = canvas.width / zoom;
    const vh = canvas.height / zoom;

    camX = Math.max(0, Math.min(me.x - vw / 2, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(me.y - vh / 2, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // Map Background
    if (rooms[me.room]) {
        ctx.fillStyle = rooms[me.room].bg;
        ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    // Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, 70, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, 40, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 32px Arial";
            ctx.fillText(pt.label, pt.x, pt.y - 95);
        }
    });

    // Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = "#e74c3c";
            ctx.beginPath(); ctx.arc(m.x, m.y, 38, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "black";
            ctx.fillRect(m.x - 30, m.y - 55, 60, 6);
            ctx.fillStyle = "#2ecc71";
            ctx.fillRect(m.x - 30, m.y - 55, (m.hp / m.maxHp) * 60, 6);
        }
    });

    // Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.isSpecial ? "white" : "yellow";
            ctx.beginPath(); ctx.arc(p.x, p.y, p.isSpecial ? 15 : 8, 0, Math.PI * 2); ctx.fill();
        }
    });

    // Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
            else if (p.charClass === 'Archer') {
                ctx.beginPath(); ctx.moveTo(p.x, p.y - 35); ctx.lineTo(p.x - 30, p.y + 25); ctx.lineTo(p.x + 30, p.y + 25); ctx.closePath(); ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 22px Arial";
            ctx.fillText(p.name, p.x, p.y - 50);
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
