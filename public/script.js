const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior';
let camX = 0, camY = 0, zoom = 0.8;
const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

function startGame() {
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!name || !pass) return;
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

window.addEventListener('wheel', e => {
    if (e.deltaY > 0) zoom = Math.max(0.3, zoom - 0.05);
    else zoom = Math.min(1.5, zoom + 0.05);
});

canvas.addEventListener('mousedown', e => {
    if (!isPlaying) return;
    const rect = canvas.getBoundingClientRect();
    socket.emit('attack', { x: (e.clientX - rect.left) / zoom + camX, y: (e.clientY - rect.top) / zoom + camY });
});

window.addEventListener('keydown', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

socket.on('init', data => {
    myId = data.id; rooms = data.rooms; portals = data.portals;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    let shop = "<h2>Blacksmith</h2>";
    for(let type in data.GEAR_TIERS) {
        shop += `<p><b>${type.toUpperCase()}</b></p>`;
        data.GEAR_TIERS[type].forEach((item, i) => {
            shop += `<button onclick="socket.emit('buyGear',{type:'${type}',tier:${i}})">${item.name} (${item.cost}g)</button>`;
        });
    }
    document.getElementById('shop-menu').innerHTML = shop;
    isPlaying = true; requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players; monsters = data.monsters; projectiles = data.projectiles;
    const me = players[myId];
    if (me) {
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('str-val').innerText = `${Math.floor(me.str)} (x${me.mults.str})`;
        document.getElementById('gold-display').innerText = me.gold;
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
        document.getElementById('cur-wep').innerText = "Weapon: " + me.equips.weapon;
    }
});

setInterval(() => { if (isPlaying) socket.emit('move', keys); }, 30);

function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const me = players[myId];

    // --- FULLSCREEN CENTERING MATH ---
    const vw = canvas.width / zoom;
    const vh = canvas.height / zoom;
    camX = Math.max(0, Math.min(me.x - vw / 2, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(me.y - vh / 2, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    ctx.fillStyle = rooms[me.room].bg;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, 60, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.fillText(pt.label, pt.x - 30, pt.y - 70);
        }
    });

    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "purple" : "red";
            ctx.beginPath(); ctx.arc(m.x, m.y, m.isBoss ? 80 : 30, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle="black"; ctx.fillRect(m.x-40, m.y-90, 80, 10);
            ctx.fillStyle="red"; ctx.fillRect(m.x-40, m.y-90, (m.hp/m.maxHp)*80, 10);
        }
    });

    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') ctx.fillRect(p.x-25, p.y-25, 50, 50);
            else if (p.charClass === 'Archer') { ctx.beginPath(); ctx.moveTo(p.x, p.y-30); ctx.lineTo(p.x-30, p.y+25); ctx.lineTo(p.x+30, p.y+25); ctx.fill(); }
            else { ctx.beginPath(); ctx.arc(p.x, p.y, 25, 0, Math.PI*2); ctx.fill(); }
            ctx.fillStyle = "white"; ctx.textAlign="center"; ctx.fillText(p.name, p.x, p.y - 60);
        }
    }

    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.fill();
        }
    });

    ctx.restore();
    requestAnimationFrame(draw);
}
