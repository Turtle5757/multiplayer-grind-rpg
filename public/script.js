const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let myId, players = {}, monsters = [], rooms = {}, portals = [], isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousedown', () => { if(isPlaying) socket.emit('attack'); });

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

socket.on('loginError', err => { alert(err); });

socket.on('init', data => {
    myId = data.id; players = data.players; monsters = data.monsters; rooms = data.rooms; portals = data.portals;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true;
    requestAnimationFrame(draw);
});

socket.on('update', data => {
    players = data.players; monsters = data.monsters;
    if (isPlaying && players[myId]) {
        const me = players[myId];
        document.getElementById('p-class').innerText = me.charClass.toUpperCase();
        document.getElementById('lvl').innerText = me.level;
        document.getElementById('str').innerText = Math.floor(me.str);
        document.getElementById('def').innerText = Math.floor(me.def);
        document.getElementById('spd').innerText = me.spd.toFixed(1);
        document.getElementById('gold').innerText = me.gold;
        document.getElementById('hp-fill').style.width = (me.hp/me.maxHp*100) + "%";
        document.getElementById('xp-fill').style.width = (me.xp/me.nextLevel*100) + "%";
    }
});

setInterval(() => { if(isPlaying) socket.emit('move', keys); }, 30);

function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const myRoomKey = players[myId].room;
    const roomData = rooms[myRoomKey];
    const time = Date.now();

    ctx.fillStyle = roomData.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for(let x=0; x<canvas.width; x+=20){ for(let y=0; y<canvas.height; y+=20){ ctx.fillStyle = roomData.floor; ctx.globalAlpha = (x+y)%40?0.9:0.8; ctx.fillRect(x,y,20,20); ctx.globalAlpha = 1; } }

    portals.forEach(pt => {
        if (pt.fromRoom === myRoomKey) {
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 30, 15, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
            ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.fillText(pt.label, pt.x, pt.y - 30);
        }
    });

    monsters.forEach(m => {
        if (m.room === myRoomKey && m.isAlive) {
            ctx.fillStyle = '#4f4'; ctx.beginPath(); ctx.ellipse(m.x, m.y, 25, 20, 0, 0, Math.PI*2); ctx.fill();
        }
    });

    let bounce = Math.sin(time/200)*5;
    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            ctx.fillStyle = p.color;
            if(p.charClass === 'Warrior') ctx.fillRect(p.x - 15, p.y - 15 + bounce, 30, 30);
            if(p.charClass === 'Archer') { ctx.beginPath(); ctx.moveTo(p.x, p.y-20+bounce); ctx.lineTo(p.x-15, p.y+15+bounce); ctx.lineTo(p.x+15, p.y+15+bounce); ctx.fill(); }
            if(p.charClass === 'Mage') { ctx.beginPath(); ctx.moveTo(p.x, p.y-20+bounce); ctx.lineTo(p.x+15, p.y+bounce); ctx.lineTo(p.x, p.y+20+bounce); ctx.lineTo(p.x-15, p.y+bounce); ctx.fill(); }
            
            ctx.fillStyle = 'white'; ctx.fillText(p.name, p.x, p.y - 35 + bounce);
            ctx.fillStyle = 'red'; ctx.fillRect(p.x-15, p.y-30+bounce, 30, 4);
            ctx.fillStyle = '#0f0'; ctx.fillRect(p.x-15, p.y-30+bounce, (p.hp/p.maxHp)*30, 4);

            if (id === myId) {
                ctx.font = "bold 14px Arial";
                if (p.room === 'gym') { ctx.fillStyle = "#ff0"; ctx.fillText("CLICK TO LIFT!", p.x, p.y + 45); }
                else if (p.room === 'track') { 
                    const isMoving = keys.w || keys.s || keys.a || keys.d;
                    ctx.fillStyle = isMoving ? "#0f0" : "#f00"; ctx.fillText(isMoving ? "RUNNING!" : "MOVE TO TRAIN!", p.x, p.y + 45); 
                }
                else if (p.room === 'lake') { 
                    const isMoving = keys.w || keys.s || keys.a || keys.d;
                    ctx.fillStyle = !isMoving ? "#0ff" : "#f00"; ctx.fillText(!isMoving ? "MEDITATING..." : "STAY STILL!", p.x, p.y + 45); 
                }
            }
        }
    }
    requestAnimationFrame(draw);
}
