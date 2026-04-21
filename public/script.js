const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId, players = {}, monsters = [], projectiles = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

canvas.width = 800;
canvas.height = 600;

// --- INITIALIZATION & UI ---

function setClass(c) {
    selectedClass = c;
    document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(c).classList.add('active');
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

function startGame() {
    const name = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!name || !pass) return alert("Enter credentials!");
    socket.emit('login', { name, password: pass, charClass: selectedClass });
}

// --- INPUT HANDLING ---

window.addEventListener('keydown', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousedown', (e) => {
    if (!isPlaying) return;
    
    // Calculate precise mouse coordinates on canvas for aiming
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    socket.emit('attack', { x: mouseX, y: mouseY });
});

// --- SOCKET EVENTS ---

socket.on('init', data => {
    myId = data.id;
    rooms = data.rooms;
    portals = data.portals;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true;
    requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players;
    monsters = data.monsters;
    projectiles = data.projectiles || [];
    
    if (players[myId]) {
        const me = players[myId];
        document.getElementById('p-class').innerText = me.charClass.toUpperCase();
        document.getElementById('lvl').innerText = me.level;
        document.getElementById('str').innerText = Math.floor(me.str);
        document.getElementById('def').innerText = Math.floor(me.def);
        document.getElementById('spd').innerText = me.spd.toFixed(1);
        document.getElementById('gold-display').innerText = me.gold;
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('shop-menu').style.display = (me.room === 'shop') ? 'block' : 'none';
    }
});

// Movement Tick
setInterval(() => { if (isPlaying) socket.emit('move', keys); }, 30);

// --- MAIN RENDER LOOP ---

function draw() {
    if (!isPlaying || !players[myId]) {
        requestAnimationFrame(draw);
        return;
    }

    const me = players[myId];
    const myRoomKey = me.room;

    // 1. Clear & Draw Background
    ctx.fillStyle = rooms[myRoomKey].bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";

    // 2. Portals
    portals.forEach(pt => {
        if (pt.fromRoom === myRoomKey) {
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.ellipse(pt.x, pt.y, 35, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = "white";
            ctx.font = "12px Arial";
            ctx.fillText(pt.label, pt.x, pt.y - 30);
        }
    });

    // 3. Monsters + Health Bars
    monsters.forEach(m => {
        if (m.room === myRoomKey && m.isAlive) {
            ctx.fillStyle = '#f44336';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 20, 0, Math.PI * 2);
            ctx.fill();
            
            // Monster Health Bar
            ctx.fillStyle = "black";
            ctx.fillRect(m.x - 20, m.y - 35, 40, 5);
            ctx.fillStyle = "red";
            ctx.fillRect(m.x - 20, m.y - 35, (m.hp / m.maxHp) * 40, 5);
        }
    });

    // 4. Projectiles (Arrows / Spells)
    projectiles.forEach(p => {
        if (p.room === myRoomKey) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            if (p.size > 8) { // Glow for spells
                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    });

    // 5. Players + Floating Stats
    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            // Draw Character
            ctx.fillStyle = p.color;
            if (p.charClass === 'Warrior') {
                ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
            } else if (p.charClass === 'Archer') {
                ctx.beginPath(); ctx.moveTo(p.x, p.y - 18); ctx.lineTo(p.x - 18, p.y + 15); ctx.lineTo(p.x + 18, p.y + 15); ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
            }

            // Name Tag
            ctx.fillStyle = 'white';
            ctx.font = "14px Arial";
            ctx.fillText(p.name, p.x, p.y - 40);

            // Floating Player Health Bar
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(p.x - 20, p.y - 34, 40, 5);
            ctx.fillStyle = (id === myId) ? "#00ff00" : "#ffcc00";
            ctx.fillRect(p.x - 20, p.y - 34, (p.hp / p.maxHp) * 40, 5);

            // 6. Zone-Specific Instructions (Only for you)
            if (id === myId) {
                ctx.fillStyle = "cyan";
                ctx.font = "bold 16px Arial";
                if (myRoomKey === 'gym') ctx.fillText("CLICK TO TRAIN STRENGTH", p.x, p.y + 50);
                if (myRoomKey === 'track') ctx.fillText("RUN TO TRAIN SPEED", p.x, p.y + 50);
                if (myRoomKey === 'lake') ctx.fillText("STAY STILL TO TRAIN DEFENSE", p.x, p.y + 50);
                if (myRoomKey === 'shop') ctx.fillText("VISIT BLACKSMITH TO BUY GEAR", p.x, p.y + 50);
            }
        }
    }

    requestAnimationFrame(draw);
}
