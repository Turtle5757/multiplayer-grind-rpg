const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME STATE ---
let myId;
let players = {};
let monsters = [];
let projectiles = [];
let rooms = {};
let portals = [];
let isPlaying = false;
let selectedClass = 'Warrior';
let camX = 0;
let camY = 0;
let zoom = 0.8;
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

function setClass(className) {
    selectedClass = className;
    document.querySelectorAll('.class-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

function startGame() {
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!name || !pass) return alert("Please enter both username and password!");
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

// --- INPUT HANDLING ---
window.addEventListener('mousemove', e => {
    mousePos.x = e.clientX;
    mousePos.y = e.clientY;
});

window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    
    // Ability Keys
    if (key === 'q' || key === 'e') {
        socket.emit('useAbility', key.toUpperCase());
    }
    
    // Movement Keys
    if (keys.hasOwnProperty(key)) {
        keys[key] = true;
    }
    
    // Chat Toggle
    if (e.key === 'Enter') {
        const input = document.getElementById('chat-input');
        if (document.activeElement === input) {
            if (input.value) socket.emit('chat', input.value);
            input.value = "";
            input.blur();
        } else {
            input.focus();
        }
    }
});

window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
        keys[key] = false;
    }
});

canvas.addEventListener('mousedown', e => {
    if (isPlaying) {
        socket.emit('attack');
    }
});

// --- NETWORK SYNC ---
socket.on('init', data => {
    myId = data.id;
    rooms = data.rooms;
    portals = data.portals;
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    // Dynamically build the shop UI based on server data
    let shopHTML = "<h2>Blacksmith</h2>";
    for (let type in data.GEAR_TIERS) {
        shopHTML += `<div style="margin-top:10px; color: #aaa;"><b>${type.toUpperCase()}</b></div>`;
        data.GEAR_TIERS[type].forEach((item, index) => {
            shopHTML += `<button class="shop-item-btn" onclick="socket.emit('buyGear', {type:'${type}', tier:${index}})">
                ${item.name} (${item.cost}g)
            </button>`;
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
        // UI Bars
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('energy-fill').style.width = (me.energy) + "%";
        
        // Stats
        document.getElementById('str-val').innerText = `${Math.floor(me.str)} (x${me.mults.str})`;
        document.getElementById('def-val').innerText = `${Math.floor(me.def)}`;
        document.getElementById('spd-val').innerText = `${me.spd.toFixed(1)}`;
        document.getElementById('gold-display').innerText = me.gold;
        
        // Equipment Display
        document.getElementById('equip-weapon').innerText = "Wep: " + me.equips.weapon;
        document.getElementById('equip-armor').innerText = "Arm: " + me.equips.armor;
        document.getElementById('equip-boots').innerText = "Bts: " + me.equips.boots;
        
        // Cooldown Overlays
        const now = Date.now();
        ['q', 'e'].forEach(key => {
            const overlay = document.getElementById(`${key}-cd`);
            const targetKey = key.toUpperCase();
            if (me.cooldowns[targetKey] && now < me.cooldowns[targetKey]) {
                overlay.style.height = "100%";
            } else {
                overlay.style.height = "0%";
            }
        });

        // Shop Visibility
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
    }
});

socket.on('msg', msg => {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerText = msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

// Movement Tick (30ms)
setInterval(() => { 
    if (isPlaying && players[myId]) {
        const me = players[myId];
        const worldMouseX = (mousePos.x / zoom) + camX;
        const worldMouseY = (mousePos.y / zoom) + camY;
        const angle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
        socket.emit('move', { keys, angle }); 
    }
}, 30);

// --- RENDERING ---
function draw() {
    if (!isPlaying || !players[myId]) {
        requestAnimationFrame(draw);
        return;
    }

    const me = players[myId];

    // Camera Clamping Logic
    const viewWidth = canvas.width / zoom;
    const viewHeight = canvas.height / zoom;

    if (WORLD_SIZE > viewWidth) {
        camX = Math.max(0, Math.min(me.x - viewWidth / 2, WORLD_SIZE - viewWidth));
    } else {
        camX = (WORLD_SIZE - viewWidth) / 2;
    }

    if (WORLD_SIZE > viewHeight) {
        camY = Math.max(0, Math.min(me.y - viewHeight / 2, WORLD_SIZE - viewHeight));
    } else {
        camY = (WORLD_SIZE - viewHeight) / 2;
    }

    // Clear and Transform
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 1. Draw Background
    ctx.fillStyle = rooms[me.room] ? rooms[me.room].bg : "#000";
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // 2. Draw Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 60, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 20px Arial";
            ctx.fillText(pt.label, pt.x, pt.y - 80);
        }
    });

    // 3. Draw Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "#8e44ad" : "#e74c3c";
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.isBoss ? 80 : 30, 0, Math.PI * 2);
            ctx.fill();
            
            // Monster Health Bar
            ctx.fillStyle = "black";
            ctx.fillRect(m.x - 40, m.y - 95, 80, 8);
            ctx.fillStyle = "#2ecc71";
            ctx.fillRect(m.x - 40, m.y - 95, (m.hp / m.maxHp) * 80, 8);
        }
    });

    // 4. Draw Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.isSpecial ? "white" : p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.isSpecial ? 12 : 8, 0, Math.PI * 2);
            ctx.fill();
            
            // Add a glow for Mage specials
            if (p.isSpecial) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = "white";
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }
    });

    // 5. Draw Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            
            // Class-Specific Shapes
            if (p.charClass === 'Warrior') {
                ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
            } else if (p.charClass === 'Archer') {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - 35);
                ctx.lineTo(p.x - 30, p.y + 25);
                ctx.lineTo(p.x + 30, p.y + 25);
                ctx.closePath();
                ctx.fill();
            } else if (p.charClass === 'Mage') {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 28, 0, Math.PI * 2);
                ctx.fill();
            }

            // Name Tags
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 16px Arial";
            ctx.fillText(p.name, p.x, p.y - 65);
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
