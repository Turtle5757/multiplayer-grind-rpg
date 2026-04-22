const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior', camX = 0, camY = 0, zoom = 0.8;
let mousePos = { x: 0, y: 0 };
const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- AUTH FUNCTIONS ---
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
    if(!name || !pass) {
        document.getElementById('auth-status').innerText = "Fill all fields!";
        return;
    }
    socket.emit('register', { name, password: pass, charClass: selectedClass });
}

function loginToAccount() {
    const name = document.getElementById('log-user').value;
    const pass = document.getElementById('log-pass').value;
    if(!name || !pass) {
        document.getElementById('auth-status').innerText = "Fill all fields!";
        return;
    }
    socket.emit('login', { name, password: pass });
}

// --- SOCKET HANDLERS ---
socket.on('authError', m => { 
    document.getElementById('auth-status').style.color = "#e74c3c";
    document.getElementById('auth-status').innerText = m; 
});

socket.on('authSuccess', m => { 
    document.getElementById('auth-status').style.color = "#2ecc71";
    document.getElementById('auth-status').innerText = m;
    setTimeout(() => toggleAuth(false), 1000); // Switch to login after success
});

socket.on('init', d => {
    myId = d.id; 
    rooms = d.rooms; 
    portals = d.portals;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    // Build Shop UI
    let h = "<h2>Blacksmith</h2>";
    for (let t in d.GEAR_TIERS) {
        h += `<div style='margin-top:10px'><b>${t.toUpperCase()}</b></div>`;
        d.GEAR_TIERS[t].forEach((item, i) => {
            h += `<button onclick="socket.emit('buyGear',{type:'${t}',tier:${i}})">${item.name} (${item.cost}g)</button>`;
        });
    }
    document.getElementById('shop-menu').innerHTML = h;
    
    isPlaying = true;
    requestAnimationFrame(draw);
});

// --- INPUTS ---
window.addEventListener('mousemove', e => { mousePos.x = e.clientX; mousePos.y = e.clientY; });
window.addEventListener('keydown', e => {
    let k = e.key.toLowerCase();
    if (k === 'q' || k === 'e') socket.emit('useAbility', k.toUpperCase());
    if (keys.hasOwnProperty(k)) keys[k] = true;
    if (e.key === 'Enter') {
        const i = document.getElementById('chat-input');
        if (document.activeElement === i) {
            if (i.value) socket.emit('chat', i.value);
            i.value = ""; i.blur();
        } else i.focus();
    }
});
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousedown', () => { if (isPlaying) socket.emit('attack'); });

socket.on('update', d => {
    players = d.players; 
    monsters = d.monsters; 
    projectiles = d.projectiles;
    
    const me = players[myId];
    if (me) {
        document.getElementById('hp-fill').style.width = (me.hp/me.maxHp*100) + "%";
        document.getElementById('energy-fill').style.width = me.energy + "%";
        document.getElementById('gold-display').innerText = me.gold;
        document.getElementById('equip-weapon').innerText = "Wep: " + me.equips.weapon;
        document.getElementById('equip-armor').innerText = "Arm: " + me.equips.armor;
        document.getElementById('equip-boots').innerText = "Bts: " + me.equips.boots;
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
        
        let now = Date.now();
        ['Q','E'].forEach(k => {
            document.getElementById(`${k.toLowerCase()}-cd`).style.height = (me.cooldowns[k] && now < me.cooldowns[k]) ? "100%" : "0%";
        });
    }
});

setInterval(() => {
    if (isPlaying && players[myId]) {
        const me = players[myId];
        const worldMouseX = (mousePos.x / zoom) + camX;
        const worldMouseY = (mousePos.y / zoom) + camY;
        const angle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
        socket.emit('move', { keys, angle });
    }
}, 30);

// --- DRAW LOOP ---
function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const me = players[myId];
    const vw = canvas.width / zoom, vh = canvas.height / zoom;

    camX = Math.max(0, Math.min(me.x - vw / 2, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(me.y - vh / 2, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // Draw Floor
    ctx.fillStyle = rooms[me.room].bg;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Draw Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.3;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, 60, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.textAlign="center";
            ctx.font = "bold 24px Arial"; ctx.fillText(pt.label, pt.x, pt.y - 80);
        }
    });

    // Draw Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "#8e44ad" : "#e74c3c";
            ctx.beginPath(); ctx.arc(m.x, m.y, m.isBoss ? 80 : 30, 0, Math.PI*2); ctx.fill();
            // HP Bar
            ctx.fillStyle="black"; ctx.fillRect(m.x-40, m.y-95, 80, 8);
            ctx.fillStyle="#2ecc71"; ctx.fillRect(m.x-40, m.y-95, (m.hp/m.maxHp)*80, 8);
        }
    });

    // Draw Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.isSpecial ? "white" : p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.isSpecial ? 12 : 8, 0, Math.PI*2); ctx.fill();
        }
    });

    // Draw Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') ctx.fillRect(p.x-25, p.y-25, 50, 50);
            else if (p.charClass === 'Archer') { 
                ctx.beginPath(); ctx.moveTo(p.x, p.y-35); ctx.lineTo(p.x-30, p.y+25); ctx.lineTo(p.x+30, p.y+25); ctx.fill(); 
            }
            else { ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, Math.PI*2); ctx.fill(); }
            
            ctx.fillStyle = "white"; ctx.textAlign="center"; ctx.font = "bold 18px Arial"; 
            ctx.fillText(p.name, p.x, p.y - 65);
        }
    }
    ctx.restore();
    requestAnimationFrame(draw);
}
