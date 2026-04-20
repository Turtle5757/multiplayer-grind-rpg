const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let myId, players = {}, monsters = [], rooms = {}, portals = [], resources = [], isPlaying = false;
let selectedClass = 'Warrior';
const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', e => { 
    const k = e.key.toLowerCase();
    if(keys.hasOwnProperty(k)) keys[k] = true; 
});
window.addEventListener('keyup', e => { 
    const k = e.key.toLowerCase();
    if(keys.hasOwnProperty(k)) keys[k] = false; 
});
window.addEventListener('mousedown', () => { if(isPlaying) socket.emit('attack'); });

function startGame() {
    const name = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    socket.emit('login', { name: name, password: pass, charClass: selectedClass });
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
});

// MOVEMENT LOOP
setInterval(() => { 
    if(isPlaying) {
        // If you see this in F12 console, WASD is working!
        if(keys.w || keys.a || keys.s || keys.d) console.log("Moving..."); 
        socket.emit('move', keys); 
    }
}, 30);

function draw() {
    if (!isPlaying || !players[myId]) { requestAnimationFrame(draw); return; }
    const myRoomKey = players[myId].room;
    ctx.fillStyle = rooms[myRoomKey].bg;
    ctx.fillRect(0, 0, 800, 600);
    
    // Draw Players
    for (let id in players) {
        let p = players[id];
        if (p.room === myRoomKey) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
            ctx.fillStyle = "white";
            ctx.fillText(p.name, p.x, p.y - 25);
        }
    }
    requestAnimationFrame(draw);
}
