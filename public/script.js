const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior';
let camX = 0, camY = 0, zoom = 0.8;
let mousePos = { x: 0, y: 0 };
const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

// --- SETUP ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    if (event) event.target.classList.add('active');
}

function startGame() {
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!name || !pass) return alert("Missing Login Info");
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

// --- INPUT HANDLING ---
window.addEventListener('mousemove', e => {
    mousePos.x = e.clientX;
    mousePos.y = e.clientY;
});

window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'q' || key === 'e') socket.emit('useAbility', key.toUpperCase());
    if (keys.hasOwnProperty(key)) keys[key] = true;
    
    if (e.key === 'Enter') {
        const input = document.getElementById('chat-input');
        if (document.activeElement === input) {
            if (input.value) socket.emit('chat', input.value);
            input.value = ""; input.blur();
        } else input.focus();
    }
});

window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
});

canvas.addEventListener('mousedown', () => {
    if (isPlaying) socket.emit('attack');
});

// --- SERVER SYNC ---
socket.on('init', data => {
    myId = data.id; rooms = data.rooms; portals = data.portals;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    let shopHTML = "<h2>Blacksmith</h2>";
    for (let type in data.GEAR_TIERS) {
        shopHTML += `<div style='margin-top:10px'><b>${type.toUpperCase()}</b></div>`;
        data.GEAR_TIERS[type].forEach((item, i) => {
            shopHTML += `<button onclick="socket.emit('buyGear',{type:'${type}',tier:${i}})">${item.name} (${item.cost}g)</button>`;
        });
    }
    document.getElementById('shop-menu').innerHTML = shopHTML;
    isPlaying = true;
    requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players;
    monsters = data.monsters;
    projectiles = data.projectiles;
    
    const me = players[myId];
    if (me) {
        // Bars
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('energy-fill').style.width = (me.energy) + "%";
        
        // Stats
        document.getElementById('str-val').innerText = `${Math.floor(me.str)} (x${me.mults.str})`;
        document.getElementById('def-val').innerText = `${Math.floor(me.def)} (x${me.mults.def})`;
        document.getElementById('spd-val').innerText = `${me.spd.toFixed(1)} (x${me.mults.spd})`;
        document.getElementById('gold-display').innerText = me.gold;
        
        // Equipment
        document.getElementById('equip-weapon').innerText = "Wep: " + me.equips.weapon;
        document.getElementById('equip-armor').innerText = "Arm: " + me.equips.armor;
        document.getElementById('equip-boots').innerText = "Bts: " + me.equips.boots;

        // Shop Visibility
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';

        // Cooldown UI Logic
        const now = Date.now();
        ['Q', 'E'].forEach(key => {
            const cdOverlay = document.getElementById(`${key.toLowerCase()}-cd`);
            if (me.cooldowns[key] && now < me.cooldowns[key]) {
                // This is a simple visual toggle, you can animate height if you want
                cdOverlay.style.height = "100%"; 
            } else {
                cdOverlay.style.height = "0%";
            }
        });
    }
});

socket.on('msg', msg => {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.innerText = msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

// Movement Loop sends the angle so the server knows where you are aiming
setInterval(() => {
    if (isPlaying && players[myId]) {
        const me = players[myId];
        const vw = canvas.width / zoom;
        const vh = canvas.height / zoom;
        const worldMouseX = (mousePos.x / zoom) + camX;
        const worldMouseY = (mousePos.y / zoom) + camY;
        const angle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
        
        socket.emit('move', { keys, angle });
    }
}, 30);

// --- RENDER ---
function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const me = players[myId];

    // Camera Math
    const vw = canvas.width / zoom;
    const vh = canvas.height / zoom;
    camX = Math.max(0, Math.min(me.x - vw / 2, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(me.y - vh / 2, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // Environment
    ctx.fillStyle = rooms[me.room].bg;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.3;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, 60, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.textAlign="center";
            ctx.fillText(pt.label, pt.x, pt.y - 75);
        }
    });

    // Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "#8e44ad" : "#e74c3c";
            ctx.beginPath(); ctx.arc(m.x, m.y, m.isBoss ? 80 : 30, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle="black"; ctx.fillRect(m.x-40, m.y-95, 80, 8);
            ctx.fillStyle="#2ecc71"; ctx.fillRect(m.x-40, m.y-95, (m.hp/m.maxHp)*80, 8);
        }
    });

    // Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.isSpecial ? "white" : p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.isSpecial ? 12 : 8, 0, Math.PI*2); ctx.fill();
        }
    });

    // Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') ctx.fillRect(p.x-25, p.y-25, 50, 50);
            else if (p.charClass === 'Archer') { ctx.beginPath(); ctx.moveTo(p.x, p.y-35); ctx.lineTo(p.x-30, p.y+25); ctx.lineTo(p.x+30, p.y+25); ctx.fill(); }
            else { ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, Math.PI*2); ctx.fill(); }
            
            ctx.fillStyle = "white"; ctx.textAlign="center";
            ctx.font = "bold 16px Arial";
            ctx.fillText(p.name, p.x, p.y - 65);
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
