const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let myId, players = {}, monsters = [];

socket.on('init', (data) => {
    myId = data.id;
    players = data.players;
    monsters = data.monsters;
});

socket.on('updateData', (data) => {
    players = data.players;
    monsters = data.monsters;
    updateGUI();
});

window.addEventListener('mousemove', (e) => {
    socket.emit('move', { x: e.clientX, y: e.clientY });
});

window.addEventListener('mousedown', () => socket.emit('attack'));

function updateGUI() {
    const me = players[myId];
    if (!me) return;

    document.getElementById('lvl').innerText = me.level;
    document.getElementById('str').innerText = me.str;
    document.getElementById('gold').innerText = me.gold;
    document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
    document.getElementById('xp-fill').style.width = (me.xp / me.nextLevel * 100) + "%";

    // Update Leaderboard
    const list = document.getElementById('leader-list');
    const sorted = Object.values(players).sort((a,b) => b.level - a.level).slice(0, 5);
    list.innerHTML = sorted.map(p => `<div class="leader-item">${p.name}: Lvl ${p.level}</div>`).join('');
}

function draw() {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    monsters.forEach(m => {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(`MONSTER HP: ${Math.ceil(m.hp)}`, m.x - 30, m.y - 30);
    });

    for (let id in players) {
        let p = players[id];
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
        ctx.fillStyle = 'white';
        ctx.fillText(p.name, p.x - 20, p.y + 30);
        if (id === myId) {
            ctx.strokeStyle = 'white';
            ctx.strokeRect(p.x - 18, p.y - 18, 36, 36);
        }
    }
    requestAnimationFrame(draw);
}
draw();
