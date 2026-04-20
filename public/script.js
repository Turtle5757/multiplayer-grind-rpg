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
    if (!name || !pass) { document.getElementById('login-msg').innerText = "Need Name & Pass!"; return; }
    socket.emit('login', { name: name, password: pass, charClass: selectedClass });
}

socket.on('loginError', err => { document.getElementById('login-msg').innerText = err; });

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
        document.getElementById('p-class').style.color = (me.charClass==='Warrior'?'#c0392b':me.charClass==='Archer'?'#27ae60':'#8e44ad');
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

    // 1. Draw Background
    ctx.fillStyle = roomData.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw "Gravel" Floor
    for(let x=0; x<canvas.width; x+=20){ for(let y=0; y<canvas.height; y+=20){ ctx.fillStyle = roomData.floor; ctx.globalAlpha = (x+y)%40?0.9:0.8; ctx.fillRect(x,y,20,20); ctx.globalAlpha = 1; } }

    // 2. Draw Decorative Zone Elements
    ctx.textAlign = 'center'; ctx.font = '16px Courier New'; ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillText(`-- ${roomData.name} --`, 400, 30);
    if(myRoomKey === 'hub') { ctx.fillStyle = '#444'; ctx.fillText("[Forge Zone]", 100, 100); ctx.fillText("[Quest NPCs]", 700, 100); }
    if(myRoomKey === 'gym') { ctx.fillStyle = '#aaa'; ctx.fillText("[Weight Bench]", 200, 300); ctx.fillText("[Power Rack]", 600, 300); ctx.fillStyle = '#666'; ctx.fillRect(150,320,100,20); ctx.fillRect(550,320,100,50); }
    if(myRoomKey === 'lake') { ctx.fillStyle = '#4ae'; ctx.globalAlpha = 0.5; ctx.fillRect(100,100,200,400); ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillText("~ MEDITATION WATER ~", 200, 300); }
    if(myRoomKey === 'track') { ctx.fillStyle = '#fff'; ctx.fillText(">>> START LINE", 200, 200); ctx.fillText("FINISH >>>", 600, 200); ctx.fillStyle = '#ddd'; ctx.fillRect(100,180,5,30); ctx.fillRect(700,180,5,30); }
    if(myRoomKey === 'dungeon') { ctx.fillStyle = '#f66'; ctx.fillText("Warning: Monsters Ahead", 400, 60); ctx.fillStyle = '#555'; ctx.fillRect(100,100,50,50); ctx.fillRect(600,400,50,50); }

    // 3. Draw Portals (Glowing Vortexes)
    portals.forEach(pt => {
        if (pt.fromRoom === myRoomKey) {
            let glow = 15 + Math.sin(time/200)*5;
            ctx.fillStyle = pt.color; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 30, 15, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
            // Draw Swirl
            ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 20+glow, glow/2, time/300, 0, Math.PI*2); ctx.stroke();
            // Label
            ctx.fillStyle = pt.color; ctx.textAlign = 'center'; ctx.fillText(`To ${pt.label}`, pt.x, pt.y - 40);
        }
    });

    // 4. Draw Monsters (Jiggling Slimes)
    monsters.forEach(m => {
        if (m.room === myRoomKey && m.isAlive) {
            let jiggle = Math.sin(time/150 + m.id)*3;
            ctx.fillStyle = (m.type==='slime'?'#4f4':'#ff4');
            ctx.beginPath(); ctx.ellipse(m.x, m.y + jiggle, 25, 20-jiggle, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = '12px Courier New'; ctx.fillText(`HP:${Math.ceil(m.hp)}`, m.x, m.y - 35);
            ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(m.x-10,m.y+2+jiggle,4,4); ctx.fillRect(m.x+6,m.y+2+jiggle,4,4); // eyes
        }
    });

    // 5. Draw Players (Idleon Bouncing style)
    let bounce = Math.sin(time/200)*5;
    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(p.x, p.y+15, 15, 8, 0, 0, Math.PI*2); ctx.fill();
            // Body
            ctx.fillStyle = p.color; ctx.fillRect(p.x - 15, p.y - 15 + bounce, 30, 30);
            // Class Decorations
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            if(p.charClass === 'Warrior') { ctx.fillRect(p.x-10,p.y-10+bounce,10,20); ctx.fillStyle='#aaa'; ctx.fillRect(p.x-5,p.y+10+bounce,20,5); } // Shield/Sword
            if(p.charClass === 'Archer') { ctx.fillStyle='#8b4513'; ctx.beginPath(); ctx.moveTo(p.x-5,p.y-10+bounce); ctx.lineTo(p.x+15,p.y+bounce); ctx.stroke(); ctx.fillRect(p.x+5,p.y-15+bounce,3,15); } // Bow/Quiver
            if(p.charClass === 'Mage') { ctx.fillStyle='#aa4'; ctx.fillRect(p.x-2,p.y-25+bounce,4,40); ctx.fillStyle='#0ff'; ctx.beginPath(); ctx.arc(p.x,p.y-25+bounce,6,0,Math.PI*2); ctx.fill(); } // Staff
            
            // Name & HP
            ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = '12px Courier'; ctx.fillText(p.name, p.x, p.y - 35 + bounce);
            ctx.fillStyle = 'red'; ctx.fillRect(p.x-15, p.y-30+bounce, 30, 4);
            ctx.fillStyle = '#0f0'; ctx.fillRect(p.x-15, p.y-30+bounce, (p.hp/p.maxHp)*30, 4);
        }
    }
    requestAnimationFrame(draw);
}
