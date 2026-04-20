const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let myId, players = {}, monsters = [], rooms = {}, portals = [], resources = [], isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

// --- CLASS SELECTOR ---
function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.style.backgroundColor = "#444");
    if(document.getElementById(c)) document.getElementById(c).style.backgroundColor = "#888";
}

// --- INPUTS ---
window.addEventListener('keydown', e => { 
    const k = e.key.toLowerCase();
    if(keys.hasOwnProperty(k)) keys[k] = true; 
    if (k === 'c' && isPlaying) socket.emit('craft', 'power_potion');
});
window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousedown', () => { if(isPlaying) socket.emit('attack'); });

function startGame() {
    const name = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

socket.on('init', data => {
    myId = data.id; players = data.players; monsters = data.monsters;
    rooms = data.rooms; portals = data.portals; resources = data.resources;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true; requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players; monsters = data.monsters; resources = data.resources;
    if (isPlaying && players[myId]) {
        const me = players[myId];
        document.getElementById('p-class').innerText = me.charClass;
        document.getElementById('lvl').innerText = me.level;
        document.getElementById('str').innerText = Math.floor(me.str);
        document.getElementById('hp-fill').style.width = (me.hp/me.maxHp*100) + "%";
    }
});

setInterval(() => { if(isPlaying) socket.emit('move', keys); }, 30);

function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const me = players[myId];
    const myRoomKey = me.room;
    ctx.fillStyle = rooms[myRoomKey].bg; ctx.fillRect(0, 0, 800, 600);
    
    // Portals
    portals.forEach(pt => {
        if (pt.fromRoom === myRoomKey) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 30, 15, 0, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.fillText(pt.label, pt.x, pt.y - 25);
        }
    });

    // Chest
    if (myRoomKey === 'hub') {
        ctx.fillStyle = '#5d4037'; ctx.fillRect(380, 280, 40, 40);
        ctx.fillStyle = 'white'; ctx.fillText("STORAGE", 400, 275);
    }

    // Resources & Monsters
    resources.forEach(r => { if (r.room === myRoomKey && r.hp > 0) { ctx.fillStyle = '#8b4513'; ctx.fillRect(r.x-10, r.y-10, 20, 20); } });
    monsters.forEach(m => { if (m.room === myRoomKey && m.isAlive) { ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(m.x, m.y, 15, 0, Math.PI*2); ctx.fill(); } });

    // Players
    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            ctx.fillStyle = p.color; ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
            ctx.fillStyle = 'white'; ctx.fillText(p.name, p.x, p.y - 20);
            if(id === myId) {
                ctx.textAlign = "left";
                ctx.fillText(`Wood: ${p.backpack.wood + p.bank.wood} Stone: ${p.backpack.stone + p.bank.stone}`, 10, 580);
                ctx.textAlign = "center";
            }
        }
    }
    requestAnimationFrame(draw);
}
