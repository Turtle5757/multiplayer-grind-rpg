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
let selectedClass = 'Warrior';

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

function setClass(c, event) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

function loginToAccount() {
    const name = document.getElementById('log-user').value;
    // Get class from the active button
    const activeBtn = document.querySelector('.class-btn.active');
    const charClass = activeBtn ? activeBtn.innerText : 'Warrior';
    
    if(!name) return alert("Enter a name!");
    socket.emit('login', { name, charClass });
}

// --- SOCKET LISTENERS ---
socket.on('init', d => {
    myId = d.id; 
    rooms = d.rooms; 
    portals = d.portals; 
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    // Build Shop Menu
    let h = "<h3>Blacksmith</h3>";
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
        // UI Updates
        document.getElementById('hp-fill').style.width = (me.hp/me.maxHp*100) + "%";
        document.getElementById('energy-fill').style.width = me.energy + "%";
        document.getElementById('gold-display').innerText = Math.floor(me.gold);
        
        // HUD Stat Updates
        document.getElementById('str-display').innerText = Math.floor(me.str);
        document.getElementById('def-display').innerText = Math.floor(me.def);
        document.getElementById('spd-display').innerText = me.spd.toFixed(1);

        // Shop Menu Visibility
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
        
        // Cooldown Rendering
        let now = Date.now();
        ['Q','E'].forEach(k => {
            const cd = document.getElementById(`${k.toLowerCase()}-cd`);
            if (cd) {
                const isCooled = me.cooldowns[k] && now < me.cooldowns[k];
                cd.style.height = isCooled ? "100%" : "0%";
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
    // Immediate Ability Trigger
    if (k === 'q' || k === 'e') socket.emit('useAbility', k.toUpperCase());
    if (keys.hasOwnProperty(k)) keys[k] = true;
});

window.addEventListener('keyup', e => { 
    let k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false; 
});

canvas.addEventListener('mousedown', () => { 
    if (isPlaying) socket.emit('attack'); 
});

// Network Sync Loop (30 FPS)
setInterval(() => {
    if (isPlaying && players[myId]) {
        const me = players[myId];
        // Calculate angle relative to world coordinates
        const worldMouseX = (mousePos.x / zoom) + camX;
        const worldMouseY = (mousePos.y / zoom) + camY;
        const angle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
        
        // Send key states and angle for movement/training
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

    // Follow Player with Boundary Clamping
    camX = Math.max(0, Math.min(me.x - vw / 2, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(me.y - vh / 2, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 1. Draw Environment
    if (rooms[me.room]) {
        ctx.fillStyle = rooms[me.room].bg;
        ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    // 2. Draw Training/Travel Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath(); 
            ctx.arc(pt.x, pt.y, 70, 0, Math.PI*2); 
            ctx.fill();
            
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 40, 0, Math.PI*2);
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
            ctx.fillStyle = m.isBoss ? "#8e44ad" : "#e74c3c";
            ctx.beginPath(); 
            ctx.arc(m.x, m.y, m.isBoss ? 80 : 38, 0, Math.PI*2); 
            ctx.fill();

            // Health Bar
            ctx.fillStyle = "black";
            ctx.fillRect(m.x - 40, m.y - 75, 80, 10);
            ctx.fillStyle = "#2ecc71";
            ctx.fillRect(m.x - 40, m.y - 75, (m.hp / m.maxHp) * 80, 10);
        }
    });

    // 4. Draw Projectiles (Attacks & Abilities)
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.isSpecial ? "white" : "yellow";
            ctx.beginPath(); 
            ctx.arc(p.x, p.y, p.isSpecial ? 15 : 8, 0, Math.PI*2); 
            ctx.fill();
            
            // Add a slight glow to special projectiles
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
            } else { // Mage
                ctx.beginPath();
                ctx.arc(p.x, p.y, 30, 0, Math.PI*2);
                ctx.fill();
            }
            
            // Nameplate
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 22px Arial";
            ctx.fillText(p.name, p.x, p.y - 50);
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
