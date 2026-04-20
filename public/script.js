const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let myId, players = {}, monsters = [], rooms = {}, portals = [], resources = [], isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

// --- CLASS BUTTON LOGIC ---
function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => {
        b.style.border = "2px solid #555";
        b.style.backgroundColor = "#444";
    });
    const selectedBtn = document.getElementById(c);
    if (selectedBtn) {
        selectedBtn.style.border = "2px solid yellow";
        selectedBtn.style.backgroundColor = "#666";
    }
}

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
        document.getElementById('p-class').innerText = me.charClass.toUpperCase();
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
    
    // Draw Portals
    portals.forEach(pt => {
        if (pt.fromRoom === myRoomKey) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 30, 15, 0, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = "white"; ctx.fillText(pt.label, pt.x, pt.y - 30);
        }
    });

    // Storage Chest (Hub only)
    if (myRoomKey === 'hub') {
        ctx.fillStyle = '#5d4037'; ctx.fillRect(380, 280, 40, 40);
        ctx.fillStyle = 'white'; ctx.fillText("CHEST", 400, 275);
    }

    // Resources
    resources.forEach(r => {
        if (r.room === myRoomKey && r.hp > 0) {
            ctx.fillStyle = (r.type === 'wood' ? '#8b4513' : '#78909c');
            ctx.fillRect(r.x-10, r.y-10, 20, 20);
        }
    });

    // Monsters
    monsters.forEach(m => {
        if (m.room === myRoomKey && m.isAlive) {
            ctx.fillStyle = '#ef5350'; ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI*2); ctx.fill();
        }
    });

    // Players
    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            ctx.fillStyle = p.color;
            // Draw Class Shape
            if(p.charClass === 'Warrior') ctx.fillRect(p.x-15, p.y-15, 30, 30);
            else if(p.charClass === 'Archer') { ctx.beginPath(); ctx.moveTo(p.x, p.y-18); ctx.lineTo(p.x-18, p.y+15); ctx.lineTo(p.x+18, p.y+15); ctx.fill(); }
            else { ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI*2); ctx.fill(); }
            
            ctx.fillStyle = 'white'; ctx.fillText(p.name, p.x, p.y - 25);
            
            if(id === myId) {
                // ZONE HINTS
                ctx.fillStyle = "yellow";
                if(p.room === 'gym') ctx.fillText("CLICK TO TRAIN STR!", p.x, p.y + 45);
                if(p.room === 'track') ctx.fillText("RUN TO TRAIN SPD!", p.x, p.y + 45);
                if(p.room === 'lake') ctx.fillText("STAY STILL FOR DEF!", p.x, p.y + 45);
                
                // INVENTORY
                ctx.textAlign = "left"; ctx.fillStyle = "#fff";
                ctx.fillText(`🎒 Wood: ${p.backpack.wood + p.bank.wood} | Stone: ${p.backpack.stone + p.bank.stone}`, 10, 580);
                ctx.textAlign = "center";
            }
        }
    }
    requestAnimationFrame(draw);
}
