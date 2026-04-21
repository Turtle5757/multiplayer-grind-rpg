const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior'; // Default
let camX = 0, camY = 0, zoom = 0.75;
const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- CLASS PICKER ---
function setClass(className) {
    selectedClass = className;
    document.querySelectorAll('.class-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function startGame() {
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if(!name) return alert("Enter a name");
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

// --- INPUTS ---
window.addEventListener('wheel', e => {
    if (e.deltaY > 0) zoom = Math.max(0.3, zoom - 0.05);
    else zoom = Math.min(1.5, zoom + 0.05);
});

canvas.addEventListener('mousedown', e => {
    if(!isPlaying) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / zoom + camX;
    const mouseY = (e.clientY - rect.top) / zoom + camY;
    socket.emit('attack', { x: mouseX, y: mouseY });
});

window.addEventListener('keydown', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

// --- SOCKETS ---
socket.on('init', data => {
    myId = data.id; rooms = data.rooms; portals = data.portals;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    // Build Shop UI
    let shopHTML = "<h2>Blacksmith</h2>";
    for(let type in data.GEAR_TIERS) {
        shopHTML += `<p><b>${type.toUpperCase()}</b></p>`;
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
    
    if (players[myId]) {
        const p = players[myId];
        document.getElementById('hp-fill').style.width = (p.hp / p.maxHp * 100) + "%";
        document.getElementById('str-val').innerText = Math.floor(p.str) + " (x" + p.mults.str + ")";
        document.getElementById('gold-display').innerText = p.gold;
        document.getElementById('equip-weapon').innerText = "Wep: " + p.equips.weapon;
        document.getElementById('shop-menu').style.display = (p.room === 'shop') ? 'block' : 'none';
    }
});

setInterval(() => { if(isPlaying) socket.emit('move', keys); }, 30);

function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const me = players[myId];

    // Perfect Centering Math
    const visibleWidth = canvas.width / zoom;
    const visibleHeight = canvas.height / zoom;
    camX = me.x - visibleWidth / 2;
    camY = me.y - visibleHeight / 2;

    // Bounds Clamping
    camX = Math.max(0, Math.min(camX, WORLD_SIZE - visibleWidth));
    camY = Math.max(0, Math.min(camY, WORLD_SIZE - visibleHeight));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // Draw Room
    ctx.fillStyle = rooms[me.room].bg;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Portals
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, 50, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.fillText(pt.label, pt.x - 20, pt.y - 60);
        }
    });

    // Monsters
    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "purple" : "red";
            ctx.beginPath(); ctx.arc(m.x, m.y, m.isBoss ? 80 : 30, 0, Math.PI*2); ctx.fill();
        }
    });

    // Players
    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x-20, p.y-20, 40, 40);
            ctx.fillStyle = "white"; ctx.fillText(p.name, p.x - 20, p.y - 30);
        }
    }

    ctx.restore();
    requestAnimationFrame(draw);
}
