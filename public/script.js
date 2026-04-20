const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let myId, players = {}, monsters = [], rooms = {}, portals = [], resources = [], isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

// --- INPUT HANDLING ---
window.addEventListener('keydown', e => { 
    const key = e.key.toLowerCase();
    if(keys.hasOwnProperty(key)) keys[key] = true; 
    
    // Crafting Shortcut
    if (key === 'c' && isPlaying) {
        socket.emit('craft', 'power_potion');
    }
});

window.addEventListener('keyup', e => { 
    if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; 
});

window.addEventListener('mousedown', () => { 
    if(isPlaying) socket.emit('attack'); 
});

// --- UI FUNCTIONS ---
function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById(c).classList.add('selected');
}

function startGame() {
    const name = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    if (!name || !pass) return;
    socket.emit('login', { name: name, password: pass, charClass: selectedClass });
}

// --- SOCKET EVENTS ---
socket.on('loginError', err => { alert(err); });

socket.on('msg', m => { console.log("SERVER:", m); });

socket.on('init', data => {
    myId = data.id;
    players = data.players;
    monsters = data.monsters;
    rooms = data.rooms;
    portals = data.portals;
    resources = data.resources;
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true;
    requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players;
    monsters = data.monsters;
    resources = data.resources;

    if (isPlaying && players[myId]) {
        const me = players[myId];
        // Update GUI
        document.getElementById('p-class').innerText = `${me.charClass.toUpperCase()}`;
        document.getElementById('lvl').innerText = me.level;
        document.getElementById('str').innerText = Math.floor(me.str);
        document.getElementById('def').innerText = Math.floor(me.def);
        document.getElementById('spd').innerText = me.spd.toFixed(1);
        document.getElementById('gold').innerText = me.gold;
        
        // Bars
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('xp-fill').style.width = (me.xp / me.nextLevel * 100) + "%";
    }
});

// Movement Loop
setInterval(() => { 
    if(isPlaying) socket.emit('move', keys); 
}, 30);

// --- DRAWING ENGINE ---
function draw() {
    if (!isPlaying || !players[myId]) { 
        requestAnimationFrame(draw); 
        return; 
    }

    const myRoomKey = players[myId].room;
    const roomData = rooms[myRoomKey];
    const time = Date.now();

    // 1. BACKGROUND
    ctx.fillStyle = roomData.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grid/Floor texture
    ctx.strokeStyle = roomData.floor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    for(let i=0; i<canvas.width; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,600); ctx.stroke(); }
    for(let i=0; i<canvas.height; i+=40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(800,i); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // 2. PORTALS
    portals.forEach(pt => {
        if (pt.fromRoom === myRoomKey) {
            let pulse = Math.sin(time/200) * 5;
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 35 + pulse, 15 + pulse/2, 0, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = "white";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText(pt.label, pt.x, pt.y - 30);
        }
    });

    // 3. STORAGE BOX (Hub only)
    if (myRoomKey === 'hub') {
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(380, 280, 40, 40); // The Box
        ctx.strokeStyle = '#3e2723';
        ctx.strokeRect(380, 280, 40, 40);
        ctx.fillStyle = 'white';
        ctx.fillText("STORAGE", 400, 275);
    }

    // 4. RESOURCES
    resources.forEach(r => {
        if (r.room === myRoomKey && r.hp > 0) {
            ctx.fillStyle = (r.type === 'wood' ? '#8b4513' : '#78909c');
            // Bouncing Resource
            let rBounce = Math.sin(time/300 + r.id) * 3;
            if (r.type === 'wood') {
                ctx.fillRect(r.x-10, r.y-20+rBounce, 20, 40); // Tree Trunk
                ctx.fillStyle = '#2e7d32';
                ctx.beginPath(); ctx.arc(r.x, r.y-25+rBounce, 20, 0, Math.PI*2); ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(r.x, r.y+rBounce, 15, 0, Math.PI*2); ctx.fill(); // Stone
            }
            ctx.fillStyle = 'white';
            ctx.fillText(`${r.type.toUpperCase()}`, r.x, r.y + 25);
        }
    });

    // 5. MONSTERS
    monsters.forEach(m => {
        if (m.room === myRoomKey && m.isAlive) {
            let mSquish = Math.sin(time/150) * 4;
            ctx.fillStyle = '#ef5350';
            ctx.beginPath(); 
            ctx.ellipse(m.x, m.y + mSquish, 25 + mSquish, 20 - mSquish, 0, 0, Math.PI*2); 
            ctx.fill();
            
            // Health bar for monster
            ctx.fillStyle = 'black'; ctx.fillRect(m.x - 20, m.y - 35, 40, 5);
            ctx.fillStyle = 'red'; ctx.fillRect(m.x - 20, m.y - 35, (m.hp/m.maxHp)*40, 5);
        }
    });

    // 6. PLAYERS
    let bounce = Math.sin(time/200) * 5;
    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.beginPath(); ctx.ellipse(p.x, p.y + 15, 15, 5, 0, 0, Math.PI*2); ctx.fill();

            // Character Body
            ctx.fillStyle = p.color;
            if(p.charClass === 'Warrior') ctx.fillRect(p.x - 15, p.y - 15 + bounce, 30, 30);
            if(p.charClass === 'Archer') {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - 20 + bounce);
                ctx.lineTo(p.x - 18, p.y + 15 + bounce);
                ctx.lineTo(p.x + 18, p.y + 15 + bounce);
                ctx.fill();
            }
            if(p.charClass === 'Mage') {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - 22 + bounce);
                ctx.lineTo(p.x + 15, p.y + bounce);
                ctx.lineTo(p.x, p.y + 22 + bounce);
                ctx.lineTo(p.x - 15, p.y + bounce);
                ctx.fill();
            }

            // Text Info
            ctx.fillStyle = 'white';
            ctx.font = "12px monospace";
            ctx.fillText(p.name, p.x, p.y - 40 + bounce);
            
            // Local Player Training Prompts
            if (id === myId) {
                ctx.fillStyle = "yellow";
                if (p.room === 'gym') ctx.fillText("CLICK TO LIFT!", p.x, p.y + 40);
                if (p.room === 'track') ctx.fillText("KEEP MOVING!", p.x, p.y + 40);
                if (p.room === 'lake') ctx.fillText("STAY STILL...", p.x, p.y + 40);
                
                // Inventory Preview
                ctx.fillStyle = "#fff";
                ctx.textAlign = "left";
                ctx.fillText(`🎒 Wood: ${p.inv.wood} | Stone: ${p.inv.stone}`, 10, 580);
                ctx.fillText(`Press 'C' to craft Power Potion (10W, 10S)`, 10, 560);
                ctx.textAlign = "center";
            }
        }
    }

    requestAnimationFrame(draw);
}
