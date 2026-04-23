const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME STATE ---
let myId = null;
let players = {};
let monsters = [];
let projectiles = [];
let rooms = {};
let portals = []; 
let isPlaying = false;

// Viewport / Camera
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

// --- UI & AUTH FUNCTIONS ---
function setClass(className, event) {
    window.selectedClass = className;
    const buttons = document.querySelectorAll('.class-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (event) event.target.classList.add('active');
}

function registerAccount() {
    const name = document.getElementById('log-user').value;
    const pass = document.getElementById('log-pass').value;
    const charClass = window.selectedClass || 'Warrior';
    socket.emit('register', { name, password: pass, charClass });
}

function loginToAccount() {
    const name = document.getElementById('log-user').value;
    const pass = document.getElementById('log-pass').value;
    socket.emit('login', { name, password: pass });
}

function buyUpgrade(type) {
    socket.emit('buyItem', type);
}

// --- SOCKET EVENTS ---
socket.on('authMessage', m => alert(m));
socket.on('authError', e => alert(e));

socket.on('init', data => {
    myId = data.id; 
    rooms = data.rooms; 
    portals = data.portals; 
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true;
    requestAnimationFrame(drawLoop);
});

socket.on('update', data => {
    players = data.players; 
    monsters = data.monsters; 
    projectiles = data.projectiles;
    
    const me = players[myId];
    if (me) {
        // 1. Core Resource Bars
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('energy-fill').style.width = me.energy + "%";
        document.getElementById('gold-display').innerText = Math.floor(me.gold);

        // 2. Base Stats & Multipliers
        document.getElementById('str-display').innerText = Math.floor(me.str);
        document.getElementById('def-display').innerText = Math.floor(me.def);
        document.getElementById('spd-display').innerText = me.spd.toFixed(1);

        document.getElementById('str-mult').innerText = me.mults.str.toFixed(1);
        document.getElementById('def-mult').innerText = me.mults.def.toFixed(1);
        document.getElementById('spd-mult').innerText = me.mults.spd.toFixed(1);

        // 3. Tiered Equipment Naming
        const tierNames = ["Novice", "Apprentice", "Hardened", "Elite", "Master", "Grandmaster", "Legendary", "Mythic"];
        const currentTier = me.upgradeTiers?.def || 0;
        document.getElementById('armor-level').innerText = tierNames[Math.min(currentTier, tierNames.length - 1)];

        // 4. Shop Visibility (Only in Blacksmith Forge)
        document.getElementById('shop-ui').style.display = (me.room === 'shop') ? 'block' : 'none';

        // 5. Ability Cooldown Overlays
        const now = Date.now();
        ['q', 'e'].forEach(k => {
            const overlay = document.getElementById(`${k}-cd`);
            if (overlay) {
                const isWaiting = me.cooldowns[k.toUpperCase()] > now;
                overlay.style.height = isWaiting ? "100%" : "0%";
            }
        });
    }
});

// --- INPUTS ---
window.addEventListener('mousemove', e => { 
    mousePos.x = e.clientX; 
    mousePos.y = e.clientY; 
});

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = true;
    if (k === 'q' || k === 'e') socket.emit('useAbility', k.toUpperCase());
});

window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
});

canvas.addEventListener('mousedown', () => { 
    if (isPlaying) socket.emit('attack'); 
});

// Send movement updates to server
setInterval(() => {
    if (isPlaying && players[myId]) {
        const me = players[myId];
        const worldX = (mousePos.x / zoom) + camX;
        const worldY = (mousePos.y / zoom) + camY;
        const angle = Math.atan2(worldY - me.y, worldX - me.x);
        socket.emit('move', { keys, angle });
    }
}, 30);

// --- RENDERING ENGINE ---
function drawLoop() {
    if (!isPlaying || !players[myId]) return requestAnimationFrame(drawLoop);

    const me = players[myId];
    const vW = canvas.width / zoom;
    const vH = canvas.height / zoom;

    // Smooth Camera Logic
    camX = Math.max(0, Math.min(me.x - vW / 2, WORLD_SIZE - vW));
    camY = Math.max(0, Math.min(me.y - vH / 2, WORLD_SIZE - vH));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 1. Draw World Background
    if (rooms[me.room]) {
        ctx.fillStyle = rooms[me.room].bg;
        ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    // 2. Draw NPC: Forge Master
    if (me.room === 'shop') {
        ctx.fillStyle = "#f1c40f"; 
        ctx.fillRect(1000 - 45, 1000 - 45, 90, 90);
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = "bold 24px Arial";
        ctx.fillText("FORGE MASTER", 1000, 930);
    }

    // 3. Draw Portals
    portals.forEach(p => {
        if (p.fromRoom === me.room) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath(); ctx.arc(p.x, p.y, 85, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.beginPath(); ctx.arc(p.x, p.y, 45, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "white"; ctx.font = "bold 24px Arial";
            ctx.fillText(p.label, p.x, p.y - 110);
        }
    });

    // 4. Draw Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath(); ctx.ellipse(m.x, m.y + 35, 45, 20, 0, 0, Math.PI * 2); ctx.fill();
            // Body
            ctx.fillStyle = "#c0392b";
            ctx.beginPath(); ctx.arc(m.x, m.y, 42, 0, Math.PI * 2); ctx.fill();
            // Eyes
            ctx.fillStyle = "black";
            ctx.fillRect(m.x - 18, m.y - 12, 10, 10);
            ctx.fillRect(m.x + 8, m.y - 12, 10, 10);
            // Health Bar
            ctx.fillStyle = "#222"; ctx.fillRect(m.x - 40, m.y - 75, 80, 10);
            ctx.fillStyle = "#ff4757"; ctx.fillRect(m.x - 40, m.y - 75, (m.hp / m.maxHp) * 80, 10);
        }
    });

    // 5. Draw Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.isSpecial ? "white" : "#f1c40f";
            ctx.beginPath(); ctx.arc(p.x, p.y, p.isSpecial ? 18 : 9, 0, Math.PI * 2); ctx.fill();
        }
    });

    // 6. Draw Players (PvP)
    for (let id in players) {
        const p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            
            // Visual feedback for DEF tier (Shield effect)
            if (p.upgradeTiers?.def > 3) {
                ctx.strokeStyle = "rgba(255,255,255,0.4)";
                ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(p.x, p.y, 38, 0, Math.PI * 2); ctx.stroke();
            }

            // Render based on class
            if (p.charClass === 'Warrior') {
                ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
            } else if (p.charClass === 'Archer') {
                ctx.beginPath(); ctx.moveTo(p.x, p.y - 35); ctx.lineTo(p.x - 30, p.y + 25); ctx.lineTo(p.x + 30, p.y + 25); ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.fill();
            }

            // Name & Info Tag
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 20px Arial";
            ctx.fillText(p.name, p.x, p.y - 55);
        }
    }

    ctx.restore();
    requestAnimationFrame(drawLoop);
}
