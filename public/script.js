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

// --- WARRIOR VISUALS ---
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
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'q') socket.emit('useAbility', 'Q');
    if (e.key.toLowerCase() === 'e') socket.emit('useAbility', 'E');
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});

window.addEventListener('mousemove', (e) => {
    const dx = e.clientX - canvas.width / 2;
    const dy = e.clientY - canvas.height / 2;
    mouseAngle = Math.atan2(dy, dx);
});

window.addEventListener('mousedown', () => {
    socket.emit('attack');
    // Local visual for Warrior
    if (me && me.charClass === 'Warrior') {
        slashEffect.active = true;
        slashEffect.timer = 10;
        slashEffect.angle = mouseAngle;
    }
});

// --- AUTH FUNCTIONS ---
function setClass(className, event) {
    window.selectedClass = className;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    const title = document.getElementById('class-title');
    const desc = document.getElementById('class-desc');
    title.innerText = className.toUpperCase();
    
    if (className === 'Warrior') desc.innerText = "Buff: 1.3x Defense. Attack: Melee Cleave. Ability: Rage.";
    else if (className === 'Archer') desc.innerText = "Buff: 1.3x Speed. Attack: Ranged. Ability: Dash.";
    else if (className === 'Mage') desc.innerText = "Buff: 1.3x Damage. Attack: Spells. Ability: Heal.";
}

function loginToAccount() {
    socket.emit('login', { 
        name: document.getElementById('log-user').value, 
        pass: document.getElementById('log-pass').value 
    });
}

function registerAccount() {
    socket.emit('register', { 
        name: document.getElementById('log-user').value, 
        password: document.getElementById('log-pass').value,
        charClass: window.selectedClass
    });
}

// --- NETWORK EVENTS ---
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
        // Update UI
        hpFill.style.width = (me.hp / me.maxHp * 100) + "%";
        manaFill.style.width = (me.mana / me.maxMana * 100) + "%";
        energyFill.style.width = me.energy + "%";
        goldDisplay.innerText = Math.floor(me.gold);
        strDisplay.innerText = me.str.toFixed(1);
        defDisplay.innerText = me.def.toFixed(1);
        spdDisplay.innerText = me.spd.toFixed(1);
        
        document.getElementById('combat-status').innerText = (me.room === 'boss_room' || me.room === 'graveyard') ? "⚠️ COMBAT ZONE" : "🛡️ SAFETY ZONE";
        document.getElementById('combat-status').style.color = (me.room === 'boss_room') ? "#ff4757" : "#2ecc71";
    }
});

socket.on('swingEffect', () => {
    // Triggered when other warriors swing
});

// --- RENDER LOOP ---
function draw() {
    if (!me) { requestAnimationFrame(draw); return; }

    ctx.fillStyle = rooms[me.room].bg || '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const camX = canvas.width / 2 - me.x;
    const camY = canvas.height / 2 - me.y;

    // Draw Portals
    portals.forEach(p => {
        if (p.fromRoom === me.room) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x + camX, p.y + camY, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.fillText(p.label, p.x + camX - 20, p.y + camY - 50);
        }
    });

    // Draw Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "#ff0000" : "#7f8c8d";
            const size = m.isBoss ? 110 : 30;
            ctx.beginPath();
            ctx.arc(m.x + camX, m.y + camY, size, 0, Math.PI * 2);
            ctx.fill();
            
            // Boss HP Bar
            if (m.isBoss) {
                ctx.fillStyle = "black";
                ctx.fillRect(m.x + camX - 100, m.y + camY - 150, 200, 10);
                ctx.fillStyle = "red";
                ctx.fillRect(m.x + camX - 100, m.y + camY - 150, (m.hp / m.maxHp) * 200, 10);
            }
        }
    });

    // Draw Projectiles
    projectiles.forEach(pr => {
        if (pr.room === me.room) {
            ctx.fillStyle = pr.owner === 'BOSS' ? "red" : (pr.isSpecial ? "cyan" : "white");
            ctx.beginPath();
            ctx.arc(pr.x + camX, pr.y + camY, pr.isSpecial ? 8 : 4, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Draw Players
    Object.values(players).forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x + camX, p.y + camY, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText(p.name, p.x + camX, p.y + camY - 35);
        }
    });

    // Warrior Slash Animation
    if (slashEffect.active && me.charClass === 'Warrior') {
        ctx.strokeStyle = "rgba(255, 255, 255, " + (slashEffect.timer / 10) + ")";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(me.x + camX, me.y + camY, 80, slashEffect.angle - 0.8, slashEffect.angle + 0.8);
        ctx.stroke();
        slashEffect.timer--;
        if (slashEffect.timer <= 0) slashEffect.active = false;
    }

    socket.emit('move', { keys, angle: mouseAngle });
    requestAnimationFrame(draw);
}

draw();
