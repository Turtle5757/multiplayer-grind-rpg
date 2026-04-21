const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior'; // Default
let camX = 0, camY = 0, zoom = 0.8;
const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

// --- INITIAL SETUP ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- LOGIN & CLASS LOGIC ---
function setClass(className) {
    selectedClass = className;
    document.querySelectorAll('.class-btn').forEach(btn => btn.classList.remove('active'));
    // Ensure the clicked button gets the active style
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

function startGame() {
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!name || !pass) return alert("Enter both username and password!");
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

// --- INPUTS ---
window.addEventListener('wheel', e => {
    if (e.deltaY > 0) zoom = Math.max(0.3, zoom - 0.05);
    else zoom = Math.min(1.5, zoom + 0.05);
});

canvas.addEventListener('mousedown', e => {
    if (!isPlaying) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / zoom + camX;
    const mouseY = (e.clientY - rect.top) / zoom + camY;
    socket.emit('attack', { x: mouseX, y: mouseY });
});

window.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const input = document.getElementById('chat-input');
        if (document.activeElement === input) {
            if (input.value) socket.emit('chat', input.value);
            input.value = ""; input.blur();
        } else input.focus();
    }
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', e => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});

// --- SERVER SYNC ---
socket.on('init', data => {
    myId = data.id;
    rooms = data.rooms;
    portals = data.portals;
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    // BUILD SHOP UI
    let shopHTML = "<h2>Blacksmith</h2>";
    for (let type in data.GEAR_TIERS) {
        shopHTML += `<div style="margin-top:10px;"><b>${type.toUpperCase()}</b></div>`;
        data.GEAR_TIERS[type].forEach((item, index) => {
            shopHTML += `<button onclick="socket.emit('buyGear', {type:'${type}', tier:${index}})">${item.name} (${item.cost}g)</button>`;
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
        // UI STATS UPDATES (Matches the new HTML IDs)
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('str-val').innerText = `${Math.floor(me.str)} (x${me.mults.str})`;
        document.getElementById('def-val').innerText = `${Math.floor(me.def)} (x${me.mults.def})`;
        document.getElementById('spd-val').innerText = `${me.spd.toFixed(1)} (x${me.mults.spd})`;
        document.getElementById('gold-display').innerText = me.gold;
        
        // EQUIPMENT LABELS
        document.getElementById('equip-weapon').innerText = "Wep: " + me.equips.weapon;
        document.getElementById('equip-armor').innerText = "Arm: " + me.equips.armor;
        document.getElementById('equip-boots').innerText = "Bts: " + me.equips.boots;
        
        // SHOP TOGGLE
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
    }
});

socket.on('msg', msg => {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.innerText = msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

// Movement Tick
setInterval(() => { if (isPlaying) socket.emit('move', keys); }, 30);

// --- RENDER ENGINE ---
function draw() {
    if (!isPlaying || !players[myId]) {
        requestAnimationFrame(draw);
        return;
    }
    const me = players[myId];

    // CENTERING LOGIC
    const vw = canvas.width / zoom;
    const vh = canvas.height / zoom;
    camX = me.x - vw / 2;
    camY = me.y - vh / 2;

    // Boundary Clamp
    camX = Math.max(0, Math.min(camX, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(camY, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 1. BACKGROUND
    ctx.fillStyle = (rooms[me.room] && rooms[me.room].bg) ? rooms[me.room].bg : "#111";
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // 2. PORTALS
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, 60, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.textAlign = "center";
            ctx.fillText(pt.label, pt.x, pt.y - 75);
        }
    });

    // 3. MONSTERS & BOSS
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "#8e44ad" : "#e74c3c";
            ctx.beginPath(); ctx.arc(m.x, m.y, m.isBoss ? 85 : 30, 0, Math.PI * 2); ctx.fill();
            
            // HP Bar
            ctx.fillStyle = "black"; ctx.fillRect(m.x - 40, m.y - 100, 80, 10);
            ctx.fillStyle = "#2ecc71"; ctx.fillRect(m.x - 40, m.y - 100, (m.hp / m.maxHp) * 80, 10);
            if(m.isBoss) {
                ctx.fillStyle = "white"; ctx.fillText("BOSS", m.x, m.y - 110);
            }
        }
    });

    // 4. PROJECTILES
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.color || "yellow";
            ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
        }
    });

    // 5. PLAYERS
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            // Class-based Shapes
            if (p.charClass === 'Warrior') {
                ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
            } else if (p.charClass === 'Archer') {
                ctx.beginPath(); ctx.moveTo(p.x, p.y - 35); ctx.lineTo(p.x - 30, p.y + 25); ctx.lineTo(p.x + 30, p.y + 25); ctx.fill();
            } else { // Mage
                ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, Math.PI * 2); ctx.fill();
            }

            // Name & Info
            ctx.fillStyle = "white"; ctx.textAlign = "center";
            ctx.font = "bold 16px Arial";
            ctx.fillText(p.name, p.x, p.y - 70);
            ctx.font = "12px Arial";
            ctx.fillText(`Lvl ${Math.floor(p.str/2)} ${p.charClass}`, p.x, p.y - 50);
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
