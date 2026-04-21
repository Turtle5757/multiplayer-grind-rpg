const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], gearData = {}, isPlaying = false;
let camX = 0, camY = 0, zoom = 0.75;
const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

window.addEventListener('wheel', e => {
    if (e.deltaY > 0) zoom = Math.max(0.4, zoom - 0.05);
    else zoom = Math.min(1.5, zoom + 0.05);
});

function startGame() {
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    socket.emit('login', { name, password: pass, charClass: 'Warrior' });
}

// Shop Buying Logic
function buyItem(type, tier) {
    socket.emit('buyGear', { type, tier });
}

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
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    socket.emit('attack', { x: (e.clientX - rect.left) / zoom + camX, y: (e.clientY - rect.top) / zoom + camY });
});

socket.on('init', data => {
    myId = data.id; rooms = data.rooms; portals = data.portals; gearData = data.GEAR_TIERS;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    // Generate Shop HTML
    let shopHTML = "<h3>The Blacksmith</h3>";
    ['weapon', 'armor', 'boots'].forEach(type => {
        shopHTML += `<div style='margin-bottom:10px'><b>${type.toUpperCase()}</b>`;
        gearData[type].forEach((item, index) => {
            shopHTML += `<button onclick="buyItem('${type}', ${index})">${item.name} (${item.cost}g)</button>`;
        });
        shopHTML += `</div>`;
    });
    document.getElementById('shop-menu').innerHTML = shopHTML;
    
    isPlaying = true; requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players; monsters = data.monsters; projectiles = data.projectiles;
    if (players[myId]) {
        const p = players[myId];
        document.getElementById('str-val').innerText = `${Math.floor(p.str)} (x${p.mults.str})`;
        document.getElementById('def-val').innerText = `${Math.floor(p.def)} (x${p.mults.def})`;
        document.getElementById('spd-val').innerText = `${p.spd.toFixed(1)} (x${p.mults.spd})`;
        document.getElementById('gold-display').innerText = p.gold;
        document.getElementById('hp-fill').style.width = (p.hp / p.maxHp * 100) + "%";
        document.getElementById('shop-menu').style.display = (p.room === 'shop') ? 'block' : 'none';
        
        document.getElementById('equip-weapon').innerText = "Wep: " + p.equips.weapon;
        document.getElementById('equip-armor').innerText = "Arm: " + p.equips.armor;
        document.getElementById('equip-boots').innerText = "Bts: " + p.equips.boots;
    }
});

setInterval(() => { if (isPlaying) socket.emit('move', keys); }, 30);

function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const me = players[myId];
    const vw = canvas.width / zoom, vh = canvas.height / zoom;
    camX = Math.max(0, Math.min(me.x - vw/2, WORLD_SIZE - vw));
    camY = Math.max(0, Math.min(me.y - vh/2, WORLD_SIZE - vh));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom); ctx.translate(-camX, -camY);

    ctx.fillStyle = rooms[me.room].bg; ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    
    portals.forEach(pt => {
        if (pt.fromRoom === me.room) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.3;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 60, 20, 0, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.textAlign="center";
            ctx.fillText(pt.label, pt.x, pt.y - 40);
        }
    });

    monsters.forEach(m => {
        if (m.room === me.room && m.isAlive) {
            ctx.fillStyle = m.isBoss ? "#8e44ad" : "#f44336";
            ctx.beginPath(); ctx.arc(m.x, m.y, m.isBoss ? 70 : 30, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle="black"; ctx.fillRect(m.x-40, m.y-90, 80, 10);
            ctx.fillStyle="red"; ctx.fillRect(m.x-40, m.y-90, (m.hp/m.maxHp)*80, 10);
        }
    });

    for (let id in players) {
        let p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color; ctx.fillRect(p.x-20, p.y-20, 40, 40);
            ctx.fillStyle = "white"; ctx.textAlign="center"; ctx.fillText(p.name, p.x, p.y-50);
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
