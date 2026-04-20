const keys = { w: false, a: false, s: false, d: false };
let isPlaying = false;

window.addEventListener('keydown', (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

// Send WASD data to server every 30ms
setInterval(() => {
    if (isPlaying) socket.emit('move', keys);
}, 30);

function startGame() {
    const name = document.getElementById('username').value || "Noob";
    
    // Check Local Storage for existing account
    let savedData = localStorage.getItem('rpg_account_' + name);
    let userData = savedData ? JSON.parse(savedData) : { name: name };

    socket.emit('login', userData);
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    isPlaying = true;
}

// Save data locally every 5 seconds
setInterval(() => {
    if (isPlaying && players[myId]) {
        localStorage.setItem('rpg_account_' + players[myId].name, JSON.stringify(players[myId]));
    }
}, 5000);

// Update draw() to include DEF and SPD in the GUI text
function updateGUI() {
    const me = players[myId];
    if (!me) return;
    document.getElementById('lvl').innerText = me.level;
    document.getElementById('str').innerText = Math.floor(me.str);
    document.getElementById('def').innerText = Math.floor(me.def);
    document.getElementById('spd').innerText = me.spd.toFixed(1);
    document.getElementById('gold').innerText = me.gold;
    // ... (rest of your bar logic)
}
