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

// --- AUTHENTICATION ---
function setClass(c, event) {
    window.selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    if(event) event.target.classList.add('active');
}

function loginToAccount() {
    const nameInput = document.getElementById('log-user');
    const name = (nameInput && nameInput.value) ? nameInput.value : "Player";
    const charClass = window.selectedClass || 'Warrior';
    socket.emit('login', { name, charClass });
}

// --- SOCKET LISTENERS ---
socket.on('init', d => {
    myId = d.id; 
    rooms = d.rooms; 
    portals = d.portals; 
    
    // UI Transitions
    const loginScreen = document.getElementById('login-screen');
    const gui = document.getElementById('gui');
    if(loginScreen) loginScreen.style.display = 'none';
    if(gui) gui.style.display = 'block';
    
    isPlaying = true;
    requestAnimationFrame(draw);
});

socket.on('update', d => {
    players = d.players; 
    monsters = d.monsters; 
    projectiles = d.projectiles;
    
    const me = players[myId];
    if (me) {
        // Update Stats HUD
        const hpFill = document.getElementById('hp-fill');
        const energyFill = document.getElementById('energy-fill');
        const goldDisplay = document.getElementById('gold-display');
        
        if(hpFill) hpFill.style.width = (me.hp / me.maxHp * 100) + "%";
        if(energyFill) energyFill.style.width = me.energy + "%";
        if(goldDisplay) goldDisplay.innerText = Math.floor(me.gold);
        
        // Update Training Stats
        const strDisp = document.getElementById('str-display');
        const defDisp = document.getElementById('def-display');
        const spdDisp = document.getElementById('spd-display');
        
        if(strDisp) strDisp.innerText = Math.floor(me.str);
        if(defDisp) defDisp.innerText = Math.floor(me.def);
        if(spdDisp) spdDisp.innerText = me.spd.toFixed(1);

        // Ability Cooldown Visuals
        let now = Date.now();
        ['Q', 'E'].forEach(k => {
            const cdFill = document.getElementById(`${k.toLowerCase()}-cd`);
            if (cdFill) {
                const isCooled = me.cooldowns[k] && now < me.cooldowns[k];
                cdFill.style.height = isCooled ? "100%" : "0%";
            }
        });
    }
});

// --- INPUT HANDLING ---
window.addEventListener('mousemove', e => { 
    mousePos.x = e.clientX; 
    mousePos.y = e.clientY; 
});

window.addEventListener('keydown', e => {
    let k = e.key.toLowerCase();
    // Q/E for special abilities
    if (k === 'q' || k === 'e') socket.emit('useAbility', k.toUpperCase());
    // Movement keys
    if (keys.hasOwnProperty(k)) keys[k] = true;
});

window.addEventListener('keyup', e => { 
    let k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false; 
});

canvas.addEventListener('mousedown', () => { 
    if (isPlaying) socket.emit('attack'); 
});

// Movement Sync (30 FPS)
setInterval(() => {
    if (isPlaying && players[myId]) {
        const me = players[myId];
        // Translate screen mouse to world mouse for aiming
        const worldMouseX = (mousePos.x / zoom) + camX;
        const worldMouseY = (mousePos.y / zoom) + camY;
        const angle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
        socket.emit('move', { keys, angle });
    }
}, 30);

// --- RENDER ENGINE ---
function draw() {
    if (!isPlaying || !players[myId]) { 
        requestAnimationFrame(draw); 
        return; 
    }

    const me = players[myId];
    const vw = canvas.width / zoom;
    const vh = canvas.height / zoom;

    // Smooth Camera Following with Edge Clamping
    camX = Math.max(0, Math.min(me.x - vw / 2, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(me.y - vh / 2, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 1. Draw Map Background
    if (rooms[me.room]) {
        ctx.fillStyle = rooms[me.room].bg;
        ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    // 2. Draw Training/Dungeon Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath(); 
            ctx.arc(pt.x, pt.y, 70, 0, Math.PI * 2); 
            ctx.fill();
            
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 40, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 32px Arial";
            ctx.fillText(pt.label, pt.x, pt.y - 95);
        }
    });

    // 3. Draw Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = "#e74c3c";
            ctx.beginPath(); 
            ctx.arc(m.x, m.y, 38, 0, Math.PI * 2); 
            ctx.fill();

            // Monster HP Bar
            ctx.fillStyle = "black";
            ctx.fillRect(m.x - 30, m.y - 55, 60, 6);
            ctx.fillStyle = "#2ecc71";
            ctx.fillRect(m.x - 30, m.y - 55, (m.hp / m.maxHp) * 60, 6);
        }
    });

    // 4. Draw Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.isSpecial ? "white" : "yellow";
            ctx.beginPath(); 
            ctx.arc(p.x, p.y, p.isSpecial ? 15 : 8, 0, Math.PI * 2); 
            ctx.fill();
        }
    });

    // 5. Draw Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            
            // Render Class-Specific Shapes
            if (p.charClass === 'Warrior') {
                ctx.fillRect(p.x - 25, p.y - 25, 50, 50); // SQUARE
            } else if (p.charClass === 'Archer') {
                ctx.beginPath(); // TRIANGLE
                ctx.moveTo(p.x, p.y - 35);
                ctx.lineTo(p.x - 30, p.y + 25);
                ctx.lineTo(p.x + 30, p.y + 25);
                ctx.closePath();
                ctx.fill();
            } else if (p.charClass === 'Mage') {
                ctx.beginPath(); // CIRCLE
                ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Player Name and Health Indicator (Simplified)
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 22px Arial";
            ctx.fillText(p.name, p.x, p.y - 50);
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
