const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let myId, players = {}, monsters = [], rooms = {}, portals = [], resources = [], isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

// --- INPUTS ---
window.addEventListener('keydown', e => { 
    const k = e.key.toLowerCase();
    if(keys.hasOwnProperty(k)) keys[k] = true; 
    if (k === 'c' && isPlaying) socket.emit('craft', 'power_potion');
});
window.addEventListener('keyup', e => { 
    const k = e.key.toLowerCase();
    if(keys.hasOwnProperty(k)) keys[k] = false; 
});
window.addEventListener('mousedown', () => { if(isPlaying) socket.emit('attack'); });

// --- LOGIN ---
function startGame() {
    const name = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    if (!name || !pass) return;
    socket.emit('login', { name: name, password: pass, charClass: selectedClass });
}

// --- SOCKETS ---
socket.on('init', data => {
    myId = data.id; players = data.players; monsters = data.monsters;
    rooms = data.rooms; portals = data.portals; resources = data.resources;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true;
    requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players; monsters = data.monsters; resources = data.resources;
    if (isPlaying && players[myId]) {
        const me = players[myId];
        document.getElementById('p-class').innerText = `${me.charClass.toUpperCase()}`;
        document.getElementById('lvl').innerText = me.level;
        document.getElementById('str').innerText = Math.floor(me.str);
        document.getElementById('def').innerText = Math.floor(me.def);
        document.getElementById('spd').innerText = me.spd.toFixed(1);
        document.getElementById('gold').innerText = me.gold;
        document.getElementById('hp-fill').style.width = (me.hp/me.maxHp*100) + "%";
        document.getElementById('xp-fill').style.width = (me.xp/me.nextLevel*100) + "%";
    }
});

// --- MOVEMENT LOOP (Fixed at 30ms) ---
setInterval(() => { 
    if(isPlaying) socket.emit('move', keys); 
}, 30);

// --- RENDER ENGINE ---
function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const myRoomKey = players[myId].room;
    const roomData = rooms[myRoomKey];
    const time = Date.now();

    // 1. BG
    ctx.fillStyle = roomData.bg; ctx.fillRect(0, 0, 800, 600);
    
    // 2. PORTALS
    portals.forEach(pt => {
        if (pt.fromRoom === myRoomKey) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 30, 15, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "white"; ctx.fillText(pt.label, pt.x, pt.y - 30);
        }
    });

    // 3. STORAGE BOX (Hub only)
    if (myRoomKey === 'hub') {
        ctx.fillStyle = '#5d4037'; ctx.fillRect(380, 280, 40, 40);
        ctx.fillStyle = 'white'; ctx.fillText("STORAGE", 400, 275);
    }

    // 4. RESOURCES
    resources.forEach(r => {
        if (r.room === myRoomKey && r.hp > 0) {
            ctx.fillStyle = (r.type === 'wood' ? '#8b4513' : '#78909c');
            ctx.fillRect(r.x-10, r.y-10, 20, 20);
            ctx.fillStyle = 'white'; ctx.fillText(r.type.toUpperCase(), r.x, r.y + 25);
        }
    });

    // 5. MONSTERS
    monsters.forEach(m => {
        if (m.room === myRoomKey && m.isAlive) {
            ctx.fillStyle = '#ef5350'; ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI*2); ctx.fill();
        }
    });

    // 6. PLAYERS & HUD
    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            ctx.fillStyle = p.color; ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
            ctx.fillStyle = 'white'; ctx.fillText(p.name, p.x, p.y - 30);
            
            // Training Hints
            if (id === myId) {
                ctx.fillStyle = "yellow";
                if (p.room === 'gym') ctx.fillText("CLICK TO LIFT!", p.x, p.y + 40);
                if (p.room === 'track') ctx.fillText("KEEP MOVING!", p.x, p.y + 40);
                if (p.room === 'lake') ctx.fillText("STAY STILL...", p.x, p.y + 40);
                
                // Inventory HUD
                ctx.fillStyle = "#fff"; ctx.textAlign = "left";
                ctx.fillText(`🎒 Wood: ${p.backpack.wood + p.bank.wood} | Stone: ${p.backpack.stone + p.bank.stone}`, 10, 580);
                ctx.textAlign = "center";
            }
        }
    }
    requestAnimationFrame(draw);
}
