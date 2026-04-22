const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId;
let players = {};
let monsters = [];
let projectiles = [];
let rooms = {};
let portals = []; // This must be populated by the init event
let isPlaying = false;
let selectedClass = 'Warrior';
let camX = 0;
let camY = 0;
let zoom = 0.8;
let mousePos = { x: 0, y: 0 };

const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

// Handle Resize
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- UI & AUTH ---
function toggleAuth(isReg) {
    document.getElementById('create-view').style.display = isReg ? 'block' : 'none';
    document.getElementById('login-view').style.display = isReg ? 'none' : 'block';
    document.getElementById('auth-status').innerText = "";
}

function setClass(c, event) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

function registerAccount() {
    const name = document.getElementById('reg-user').value;
    const pass = document.getElementById('reg-pass').value;
    if(!name || !pass) return;
    socket.emit('register', { name, password: pass, charClass: selectedClass });
}

function loginToAccount() {
    const name = document.getElementById('log-user').value;
    const pass = document.getElementById('log-pass').value;
    if(!name || !pass) return;
    socket.emit('login', { name, password: pass });
}

// --- SOCKET EVENTS ---
socket.on('authError', m => { 
    document.getElementById('auth-status').style.color = "#e74c3c";
    document.getElementById('auth-status').innerText = m; 
});

socket.on('authSuccess', m => { 
    document.getElementById('auth-status').style.color = "#2ecc71";
    document.getElementById('auth-status').innerText = m;
    setTimeout(() => toggleAuth(false), 1000);
});

socket.on('init', d => {
    myId = d.id; 
    rooms = d.rooms; 
    portals = d.portals; // SAVING PORTALS FROM SERVER
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    // Build Shop UI
    let h = "<h2>Blacksmith</h2>";
    for (let t in d.GEAR_TIERS) {
        h += `<div class='shop-cat'><b>${t.toUpperCase()}</b></div>`;
        d.GEAR_TIERS[t].forEach((item, i) => {
            h += `<button class='shop-btn' onclick="socket.emit('buyGear',{type:'${t}',tier:${i}})">${item.name} (${item.cost}g)</button>`;
        });
    }
    document.getElementById('shop-menu').innerHTML = h;
    
    isPlaying = true;
    requestAnimationFrame(draw);
});

socket.on('update', d => {
    players = d.players; 
    monsters = d.monsters; 
    projectiles = d.projectiles;
    
    const me = players[myId];
    if (me) {
        document.getElementById('hp-fill').style.width = (me.hp/me.maxHp*100) + "%";
        document.getElementById('energy-fill').style.width = me.energy + "%";
        document.getElementById('gold-display').innerText = me.gold;
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
        
        let now = Date.now();
        ['Q','E'].forEach(k => {
            const cd = document.getElementById(`${k.toLowerCase()}-cd`);
            if (cd) cd.style.height = (me.cooldowns[k] && now < me.cooldowns[k]) ? "100%" : "0%";
        });
    }
});

// --- INPUTS ---
window.addEventListener('mousemove', e => { 
    mousePos.x = e.clientX; 
    mousePos.y = e.clientY; 
});

window.addEventListener('keydown', e => {
    let k = e.key.toLowerCase();
    if (k === 'q' || k === 'e') socket.emit('useAbility', k.toUpperCase());
    if (keys.hasOwnProperty(k)) keys[k] = true;
});

window.addEventListener('keyup', e => { 
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; 
});

canvas.addEventListener('mousedown', () => { 
    if (isPlaying) socket.emit('attack'); 
});

// Input Loop (30fps)
setInterval(() => {
    if (isPlaying && players[myId]) {
        const me = players[myId];
        const worldMouseX = (mousePos.x / zoom) + camX;
        const worldMouseY = (mousePos.y / zoom) + camY;
        const angle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
        socket.emit('move', { keys, angle });
    }
}, 30);

// --- DRAWING ---
function draw() {
    if (!isPlaying || !players[myId]) { 
        requestAnimationFrame(draw); 
        return; 
    }

    const me = players[myId];
    const vw = canvas.width / zoom;
    const vh = canvas.height / zoom;

    // Camera follow
    camX = Math.max(0, Math.min(me.x - vw / 2, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(me.y - vh / 2, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 1. Draw Floor
    if (rooms[me.room]) {
        ctx.fillStyle = rooms[me.room].bg;
        ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    // 2. Draw Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            // Portal Glow
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = 0.2;
            ctx.beginPath(); 
            ctx.arc(pt.x, pt.y, 70, 0, Math.PI*2); 
            ctx.fill();
            
            // Core
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 40, 0, Math.PI*2);
            ctx.fill();

            // Label
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 28px Arial";
            ctx.fillText(pt.label, pt.x, pt.y - 90);
        }
    });

    // 3. Draw Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "#8e44ad" : "#e74c3c";
            ctx.beginPath(); 
            ctx.arc(m.x, m.y, m.isBoss ? 80 : 30, 0, Math.PI*2); 
            ctx.fill();

            // Monster HP Bar
            ctx.fillStyle = "black";
            ctx.fillRect(m.x - 40, m.y - 60, 80, 10);
            ctx.fillStyle = "#2ecc71";
            ctx.fillRect(m.x - 40, m.y - 60, (m.hp / m.maxHp) * 80, 10);
        }
    });

    // 4. Draw Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.isSpecial ? "white" : p.color;
            ctx.beginPath(); 
            ctx.arc(p.x, p.y, p.isSpecial ? 12 : 8, 0, Math.PI*2); 
            ctx.fill();
        }
    });

    // 5. Draw Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            
            // Draw different shapes for classes
            if (p.charClass === 'Warrior') {
                ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
            } else if (p.charClass === 'Archer') {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - 30);
                ctx.lineTo(p.x - 30, p.y + 30);
                ctx.lineTo(p.x + 30, p.y + 30);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 28, 0, Math.PI*2);
                ctx.fill();
            }
            
            // Player Name
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 20px Arial";
            ctx.fillText(p.name, p.x, p.y - 50);
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
