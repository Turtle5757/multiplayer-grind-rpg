const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior'; // Default class
let camX = 0, camY = 0, zoom = 0.8;
const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

// --- SCREEN ADJUSTMENT ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- CLASS SELECTION LOGIC ---
function setClass(className) {
    selectedClass = className;
    // Visual feedback for buttons
    document.querySelectorAll('.class-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function startGame() {
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!name || !pass) {
        alert("Please enter a username and password.");
        return;
    }
    socket.emit('login', { name: name, password: pass, charClass: selectedClass });
}

// --- INPUT HANDLING ---
window.addEventListener('wheel', e => {
    if (e.deltaY > 0) zoom = Math.max(0.3, zoom - 0.05);
    else zoom = Math.min(1.5, zoom + 0.05);
});

canvas.addEventListener('mousedown', e => {
    if (!isPlaying) return;
    const rect = canvas.getBoundingClientRect();
    // Translate screen click to world coordinates for the server
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

// --- SERVER COMMUNICATION ---
socket.on('init', data => {
    myId = data.id;
    rooms = data.rooms;
    portals = data.portals;
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    // BUILD THE SHOP UI DYNAMICALLY
    let shopHTML = "<h2>Blacksmith</h2>";
    for (let type in data.GEAR_TIERS) {
        shopHTML += `<div class='shop-section'><b>${type.toUpperCase()}</b>`;
        data.GEAR_TIERS[type].forEach((item, index) => {
            shopHTML += `
                <button onclick="socket.emit('buyGear', {type:'${type}', tier:${index}})">
                    ${item.name} (${item.cost}g)
                </button>`;
        });
        shopHTML += `</div>`;
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
        // Update Stats UI
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('str-val').innerText = `${Math.floor(me.str)} (x${me.mults.str})`;
        document.getElementById('gold-display').innerText = me.gold;
        
        // Show/Hide Shop based on room
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
        
        // Update Equipment Text
        document.getElementById('equip-weapon').innerText = "Wep: " + me.equips.weapon;
    }
});

socket.on('msg', msg => {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.innerText = msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

// Movement Loop
setInterval(() => {
    if (isPlaying) socket.emit('move', keys);
}, 30);

// --- DRAWING LOOP ---
function draw() {
    if (!isPlaying || !players[myId]) {
        requestAnimationFrame(draw);
        return;
    }
    const me = players[myId];

    // CALCULATE CAMERA (Centers player on screen)
    const vw = canvas.width / zoom;
    const vh = canvas.height / zoom;
    camX = me.x - vw / 2;
    camY = me.y - vh / 2;

    // Constrain Camera to World Bounds
    camX = Math.max(0, Math.min(camX, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(camY, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 1. Draw Environment
    ctx.fillStyle = rooms[me.room].bg || "#111";
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // 2. Draw Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, 60, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText(pt.label, pt.x, pt.y - 70);
        }
    });

    // 3. Draw Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "#8e44ad" : "#f44336";
            ctx.beginPath(); ctx.arc(m.x, m.y, m.isBoss ? 80 : 30, 0, Math.PI * 2); ctx.fill();
            
            // Monster Health Bar
            ctx.fillStyle = "black"; ctx.fillRect(m.x - 40, m.y - 95, 80, 8);
            ctx.fillStyle = "#2ecc71"; ctx.fillRect(m.x - 40, m.y - 95, (m.hp / m.maxHp) * 80, 8);
        }
    });

    // 4. Draw Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.color || "white";
            ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
        }
    });

    // 5. Draw Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            
            // Different shapes for different classes
            if (p.charClass === 'Warrior') {
                ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
            } else if (p.charClass === 'Archer') {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - 30);
                ctx.lineTo(p.x - 30, p.y + 25);
                ctx.lineTo(p.x + 30, p.y + 25);
                ctx.fill();
            } else { // Mage
                ctx.beginPath();
                ctx.arc(p.x, p.y, 25, 0, Math.PI * 2);
                ctx.fill();
            }

            // Name Tag
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 16px Arial";
            ctx.fillText(p.name, p.x, p.y - 65);
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
