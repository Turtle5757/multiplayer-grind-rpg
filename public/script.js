const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- GAME STATE ---
let me = null;
let players = {};
let monsters = [];
let projectiles = [];
let rooms = {};
let portals = [];
window.selectedClass = 'Warrior';

// --- VISUAL EFFECTS ---
let slashEffect = { active: false, timer: 0, angle: 0 };

// --- UI ELEMENTS ---
const gui = document.getElementById('gui');
const loginScreen = document.getElementById('login-screen');
const hpFill = document.getElementById('hp-fill');
const energyFill = document.getElementById('energy-fill');
const manaFill = document.getElementById('mana-fill');
const goldDisplay = document.getElementById('gold-display');
const strDisplay = document.getElementById('str-display');
const defDisplay = document.getElementById('def-display');
const spdDisplay = document.getElementById('spd-display');

// --- INPUT HANDLING ---
const keys = { w: false, a: false, s: false, d: false };
let mouseAngle = 0;

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
    if (key === 'q') socket.emit('useAbility', 'Q');
    if (key === 'e') socket.emit('useAbility', 'E');
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
});

window.addEventListener('mousemove', (e) => {
    const dx = e.clientX - canvas.width / 2;
    const dy = e.clientY - canvas.height / 2;
    mouseAngle = Math.atan2(dy, dx);
});

window.addEventListener('mousedown', () => {
    socket.emit('attack');
    // Local visual for Warrior melee feedback
    if (me && me.charClass === 'Warrior') {
        slashEffect.active = true;
        slashEffect.timer = 10;
        slashEffect.angle = mouseAngle;
    }
});

// --- AUTH FUNCTIONS (FIXED) ---
function setClass(className, event) {
    window.selectedClass = className;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    const title = document.getElementById('class-title');
    const desc = document.getElementById('class-desc');
    title.innerText = className.toUpperCase();
    
    if (className === 'Warrior') desc.innerText = "Buff: 1.3x Defense & 2x Str Training. Attack: Melee. Ability: Rage.";
    else if (className === 'Archer') desc.innerText = "Buff: 1.3x Speed & 2x Spd Training. Attack: Ranged. Ability: Dash.";
    else if (className === 'Mage') desc.innerText = "Buff: 1.3x Damage & 2x Def Training. Attack: Spells. Ability: Heal.";
}

function loginToAccount() {
    const name = document.getElementById('log-user').value;
    const password = document.getElementById('log-pass').value;
    if (!name || !password) return alert("Enter credentials");
    // Field name must be 'password' to match server.js
    socket.emit('login', { name, password });
}

function registerAccount() {
    const name = document.getElementById('log-user').value;
    const password = document.getElementById('log-pass').value;
    if (!name || !password) return alert("Enter credentials");
    // Field name must be 'password' to match server.js
    socket.emit('register', { 
        name, 
        password, 
        charClass: window.selectedClass 
    });
}

// --- NETWORK EVENTS ---
socket.on('authError', (msg) => alert(msg));
socket.on('authMessage', (msg) => alert(msg));

socket.on('init', (data) => {
    rooms = data.rooms;
    portals = data.portals;
    loginScreen.style.display = 'none';
    gui.style.display = 'block';
});

socket.on('update', (data) => {
    players = data.players;
    monsters = data.monsters;
    projectiles = data.projectiles;
    me = players[socket.id];

    if (me) {
        // Update Bars
        hpFill.style.width = (me.hp / me.maxHp * 100) + "%";
        manaFill.style.width = (me.mana / me.maxMana * 100) + "%";
        energyFill.style.width = me.energy + "%";
        
        // Update Numbers
        goldDisplay.innerText = Math.floor(me.gold);
        strDisplay.innerText = me.str.toFixed(1);
        defDisplay.innerText = me.def.toFixed(1);
        spdDisplay.innerText = me.spd.toFixed(1);
        
        // Zone Indicator
        const status = document.getElementById('combat-status');
        if (me.room === 'boss_room') {
            status.innerText = "💀 BOSS LAIR";
            status.style.color = "#ff4757";
        } else if (me.room === 'graveyard') {
            status.innerText = "⚠️ PVP ZONE";
            status.style.color = "#ffa502";
        } else {
            status.innerText = "🛡️ SAFETY ZONE";
            status.style.color = "#2ecc71";
        }
    }
});

// --- RENDER LOOP ---
function draw() {
    if (!me) { requestAnimationFrame(draw); return; }

    // Draw Background
    ctx.fillStyle = rooms[me.room]?.bg || '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const camX = canvas.width / 2 - me.x;
    const camY = canvas.height / 2 - me.y;

    // 1. Draw Portals
    portals.forEach(p => {
        if (p.fromRoom === me.room) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x + camX, p.y + camY, 45, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(p.label, p.x + camX, p.y + camY - 55);
        }
    });

    // 2. Draw Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "#e74c3c" : "#95a5a6";
            const size = m.isBoss ? 100 : 30;
            ctx.beginPath();
            ctx.arc(m.x + camX, m.y + camY, size, 0, Math.PI * 2);
            ctx.fill();
            
            // HP Bar for Boss
            if (m.isBoss) {
                const barW = 200;
                ctx.fillStyle = "#333";
                ctx.fillRect(m.x + camX - barW/2, m.y + camY - 130, barW, 12);
                ctx.fillStyle = "#ff4757";
                ctx.fillRect(m.x + camX - barW/2, m.y + camY - 130, (m.hp / m.maxHp) * barW, 12);
            }
        }
    });

    // 3. Draw Projectiles
    projectiles.forEach(pr => {
        if (pr.room === me.room) {
            ctx.fillStyle = pr.owner === 'BOSS' ? "#ff4757" : (pr.isSpecial ? "#00d2d3" : "white");
            ctx.beginPath();
            ctx.arc(pr.x + camX, pr.y + camY, pr.isSpecial ? 10 : 5, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // 4. Draw Players
    Object.values(players).forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x + camX, p.y + camY, 25, 0, Math.PI * 2);
            ctx.fill();
            
            // Name Tag
            ctx.fillStyle = "white";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(p.name, p.x + camX, p.y + camY - 35);
        }
    });

    // 5. Warrior Slash Animation (Local Interpolation)
    if (slashEffect.active && me.charClass === 'Warrior') {
        ctx.strokeStyle = `rgba(255, 255, 255, ${slashEffect.timer / 10})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(me.x + camX, me.y + camY, 90, slashEffect.angle - 0.8, slashEffect.angle + 0.8);
        ctx.stroke();
        slashEffect.timer--;
        if (slashEffect.timer <= 0) slashEffect.active = false;
    }

    // Input Sync
    socket.emit('move', { keys, angle: mouseAngle });
    requestAnimationFrame(draw);
}

// Start Loop
draw();
