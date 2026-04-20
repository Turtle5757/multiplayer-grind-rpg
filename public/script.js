const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth; canvas.height = window.innerHeight;

let myId, players = {}, monsters = [], zones = {}, isPlaying = false;
const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousedown', () => { if(isPlaying) socket.emit('attack'); });

function startGame() {
    const name = document.getElementById('username').value || "Noob";
    const saved = localStorage.getItem('rpg_user_' + name);
    socket.emit('login', saved ? JSON.parse(saved) : { name });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true;
}

function buy(item) { socket.emit('purchase', item); }

socket.on('init', data => { myId = data.id; players = data.players; monsters = data.monsters; zones = data.zones; });
socket.on('update', data => { 
    players = data.players; monsters = data.monsters; 
    if (isPlaying && players[myId]) {
        updateGUI(players[myId]);
        localStorage.setItem('rpg_user_' + players[myId].name, JSON.stringify(players[myId]));
        document.getElementById('shop-ui').style.display = players[myId].currentZone === 'shop' ? 'flex' : 'none';
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
    ctx.fillStyle = '#15220d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Zones
    for (let k in zones) {
        let z = zones[k];
        ctx.fillStyle = k === 'gym' ? '#444' : k === 'track' ? '#5d4037' : k === 'lake' ? '#006994' : '#ffd700';
        ctx.globalAlpha = 0.3; ctx.fillRect(z.x, z.y, z.w, z.h); ctx.globalAlpha = 1;
        ctx.fillStyle = 'white'; ctx.fillText(k.toUpperCase(), z.x + 5, z.y + 15);
    }

    // Draw Monsters
    monsters.forEach(m => {
        ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'white'; ctx.fillText(`HP: ${Math.ceil(m.hp)}`, m.x - 20, m.y - 25);
    });

    // Draw Players
    for (let id in players) {
        let p = players[id];
        ctx.fillStyle = p.color; ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
        ctx.fillStyle = 'white'; ctx.fillRect(p.x - 8, p.y - 8, 5, 5); ctx.fillRect(p.x + 3, p.y - 8, 5, 5); // Eyes
        ctx.textAlign = 'center'; ctx.fillText(p.name, p.x, p.y - 25);
        if (p.currentZone && p.currentZone !== 'shop') ctx.fillText("TRAINING...", p.x, p.y + 35);
    }
    requestAnimationFrame(draw);
}
draw();
