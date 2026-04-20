const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let myId, players = {}, monsters = [], rooms = {}, isPlaying = false;
const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousedown', () => { if(isPlaying) socket.emit('attack'); });

function startGame() {
    const name = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const msg = document.getElementById('login-msg');

    if (!name || !pass) { 
        msg.style.color = "red";
        msg.innerText = "Need Name & Password!"; 
        return; 
    }

    const saved = localStorage.getItem('rpg_user_' + name);
    
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.password !== pass) {
            msg.style.color = "red";
            msg.innerText = "Wrong Password!";
            return;
        }
        socket.emit('login', parsed);
    } else {
        const newAccount = { name: name, password: pass };
        socket.emit('login', newAccount);
        msg.style.color = "#00ff00";
        msg.innerText = "Account Created!";
    }

    setTimeout(() => {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('gui').style.display = 'block';
        isPlaying = true;
    }, 500);
}

socket.on('init', data => {
    myId = data.id;
    players = data.players;
    monsters = data.monsters;
    rooms = data.rooms;
    requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players;
    monsters = data.monsters;
    if (isPlaying && players[myId]) {
        updateGUI(players[myId]);
        localStorage.setItem('rpg_user_' + players[myId].name, JSON.stringify(players[myId]));
    }
});

setInterval(() => { if(isPlaying) socket.emit('move', keys); }, 30);

function updateGUI(me) {
    document.getElementById('lvl').innerText = me.level;
    document.getElementById('str').innerText = Math.floor(me.str);
    document.getElementById('def').innerText = Math.floor(me.def);
    document.getElementById('spd').innerText = me.spd.toFixed(1);
    document.getElementById('gold').innerText = me.gold;
    document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
    document.getElementById('xp-fill').style.width = (me.xp / me.nextLevel * 100) + "%";
}

function draw() {
    if (!isPlaying || !players[myId]) {
        requestAnimationFrame(draw);
        return;
    }

    const myRoomKey = players[myId].room;
    const roomData = rooms[myRoomKey];

    ctx.fillStyle = roomData ? roomData.color : '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.textAlign = "center";
    ctx.font = "18px Courier New";
    ctx.fillText(`Area: ${roomData ? roomData.name : 'Unknown'}`, 400, 30);

    // Directional Hints in Hub
    if (myRoomKey === 'hub') {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText("↑ SPEEDWAY", 400, 60);
        ctx.fillText("↓ GYM", 400, 560);
        ctx.fillText("← LAKE", 80, 300);
        ctx.fillText("DUNGEON →", 720, 300);
    }

    monsters.forEach(m => {
        if (m.room === myRoomKey && m.isAlive) {
            ctx.fillStyle = '#ff4444';
            ctx.beginPath(); ctx.arc(m.x, m.y, 25, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'white';
            ctx.fillText(`HP: ${Math.ceil(m.hp)}`, m.x, m.y - 35);
        }
    });

    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
            ctx.fillStyle = 'white';
            ctx.fillRect(p.x - 8, p.y - 8, 5, 5); ctx.fillRect(p.x + 3, p.y - 8, 5, 5);
            ctx.fillText(p.name, p.x, p.y - 25);
            if (roomData && roomData.stat) {
                ctx.fillStyle = "#00ff00";
                ctx.fillText("TRAINING...", p.x, p.y + 35);
            }
        }
    }
    requestAnimationFrame(draw);
}
