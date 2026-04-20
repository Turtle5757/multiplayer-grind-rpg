const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], rooms = {}, portals = [], resources = [], isPlaying = false;
let selectedClass = 'Warrior'; 
const keys = { w: false, a: false, s: false, d: false };

canvas.width = 800;
canvas.height = 600;

function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(c);
    if (btn) btn.classList.add('active');
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
        document.exitFullscreen();
    }
}

window.addEventListener('resize', () => {
    if (document.fullscreenElement) {
        canvas.style.width = '100vw'; canvas.style.height = '100vh'; canvas.style.objectFit = 'contain';
    } else {
        canvas.style.width = '800px'; canvas.style.height = '600px';
    }
});

window.addEventListener('keydown', e => { 
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = true; 
});

window.addEventListener('keyup', e => { 
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false; 
});

canvas.addEventListener('mousedown', () => { if (isPlaying) socket.emit('attack'); });

function startGame() {
    const name = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    if (!name || !pass) return alert("Enter credentials!");
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

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
        document.getElementById('p-class').innerText = me.charClass.toUpperCase();
        document.getElementById('lvl').innerText = me.level;
        document.getElementById('str').innerText = Math.floor(me.str);
        document.getElementById('def').innerText = Math.floor(me.def);
        document.getElementById('spd').innerText = me.spd.toFixed(2);
        document.getElementById('gold-display').innerText = me.gold;
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        
        // Only show shop buttons if in the shop room
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
    }
});

socket.on('msg', msg => console.log("SYSTEM:", msg));

setInterval(() => { if (isPlaying) socket.emit('move', keys); }, 30);

function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const me = players[myId];
    const myRoomKey = me.room;
    ctx.fillStyle = rooms[myRoomKey].bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    portals.forEach(pt => {
        if (pt.fromRoom === myRoomKey) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 35, 15, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0; ctx.fillStyle = "white"; ctx.textAlign = "center";
            ctx.fillText(pt.label, pt.x, pt.y - 30);
        }
    });

    if (myRoomKey === 'shop') {
        // Draw Shopkeeper
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(400, 200, 25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'white'; ctx.fillText("BLACKSMITH", 400, 160);
        ctx.fillText("UPGRADE YOUR GEAR HERE", 400, 240);
    }

    if (myRoomKey === 'hub') {
        ctx.fillStyle = '#5d4037'; ctx.fillRect(385, 285, 30, 30);
        ctx.fillStyle = 'white'; ctx.fillText("CHEST", 400, 280);
    }

    resources.forEach(r => {
        if (r.room === myRoomKey && r.hp > 0) {
            ctx.fillStyle = (r.type === 'wood' ? '#4caf50' : '#9e9e9e');
            ctx.fillRect(r.x - 10, r.y - 10, 20, 20);
        }
    });

    monsters.forEach(m => {
        if (m.room === myRoomKey && m.isAlive) {
            ctx.fillStyle = '#f44336'; ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillRect(m.x - 20, m.y - 35, 40, 6);
            ctx.fillStyle = '#ff0000'; ctx.fillRect(m.x - 20, m.y - 35, (m.hp / m.maxHp) * 40, 6);
        }
    });

    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
            else if (p.charClass === 'Archer') {
                ctx.beginPath(); ctx.moveTo(p.x, p.y - 18); ctx.lineTo(p.x - 18, p.y + 15); ctx.lineTo(p.x + 18, p.y + 15); ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = 'white'; ctx.fillText(p.name, p.x, p.y - 25);
            if (id === myId) {
                ctx.fillStyle = "yellow";
                if (p.room === 'gym') ctx.fillText("ATTACK TO TRAIN STR", p.x, p.y + 45);
                if (p.room === 'track') ctx.fillText("RUN TO TRAIN SPD", p.x, p.y + 45);
                if (p.room === 'lake') ctx.fillText("STAY STILL TO TRAIN DEF", p.x, p.y + 45);
                ctx.textAlign = "left"; ctx.fillStyle = "white";
                ctx.fillText(`🎒 Pack: W:${p.backpack.wood} S:${p.backpack.stone}`, 15, 585);
                ctx.textAlign = "center";
            }
        }
    }
    requestAnimationFrame(draw);
}
