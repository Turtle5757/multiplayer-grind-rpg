const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME STATE VARIABLES ---
let myId = null;
let players = {};
let monsters = [];
let projectiles = [];
let rooms = {};
let portals = []; 
let isPlaying = false;

// Camera & Viewport settings
let camX = 0;
let camY = 0;
let zoom = 0.75; 
let mousePos = { x: 0, y: 0 };

const WORLD_SIZE = 2000;
const keys = { w: false, a: false, s: false, d: false };

// --- INITIALIZATION ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- UI & AUTHENTICATION FUNCTIONS ---

/**
 * Handles class selection on the login screen
 */
function setClass(className, event) {
    window.selectedClass = className;
    
    // Update button visuals
    const buttons = document.querySelectorAll('.class-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

/**
 * Sends registration data to the server
 */
function registerAccount() {
    const nameInput = document.getElementById('log-user').value;
    const passInput = document.getElementById('log-pass').value;
    const chosenClass = window.selectedClass || 'Warrior';

    if (!nameInput || !passInput) {
        alert("Please enter both a username and password.");
        return;
    }

    socket.emit('register', { 
        name: nameInput, 
        password: passInput, 
        charClass: chosenClass 
    });
}

/**
 * Sends login data to the server
 */
function loginToAccount() {
    const nameInput = document.getElementById('log-user').value;
    const passInput = document.getElementById('log-pass').value;

    if (!nameInput || !passInput) {
        alert("Please enter your username and password.");
        return;
    }

    socket.emit('login', { 
        name: nameInput, 
        password: passInput 
    });
}

/**
 * Sends purchase request to the Blacksmith
 */
function buyUpgrade(statType) {
    socket.emit('buyItem', statType);
}

// --- SOCKET EVENT LISTENERS ---

socket.on('authMessage', (message) => alert(message));
socket.on('authError', (error) => alert(error));
socket.on('notification', (msg) => console.log("System:", msg));

socket.on('init', (data) => {
    myId = data.id; 
    rooms = data.rooms; 
    portals = data.portals; 
    
    // Switch from Login Screen to Game HUD
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    
    isPlaying = true;
    requestAnimationFrame(drawLoop);
});

socket.on('update', (data) => {
    players = data.players; 
    monsters = data.monsters; 
    projectiles = data.projectiles;
    
    const me = players[myId];
    if (me) {
        // 1. Update Progress Bars
        document.getElementById('hp-fill').style.width = (me.hp / me.maxHp * 100) + "%";
        document.getElementById('energy-fill').style.width = me.energy + "%";
        
        // 2. Update Text Stats
        document.getElementById('gold-display').innerText = Math.floor(me.gold);
        document.getElementById('str-display').innerText = Math.floor(me.str);
        document.getElementById('def-display').innerText = Math.floor(me.def);
        document.getElementById('spd-display').innerText = me.spd.toFixed(1);

        // 3. Update Armor Tier Name
        const armorNames = [
            "Tattered Rags", 
            "Leather Vest", 
            "Reinforced Chain", 
            "Iron Plate", 
            "Knight's Steel", 
            "Dragonscale", 
            "Godly Plate"
        ];
        const tierIndex = Math.min(me.armorTier, armorNames.length - 1);
        document.getElementById('armor-level').innerText = armorNames[tierIndex];

        // 4. Toggle Blacksmith UI visibility
        const shopUI = document.getElementById('shop-ui');
        if (shopUI) {
            shopUI.style.display = (me.room === 'shop') ? 'block' : 'none';
        }

        // 5. Handle Cooldown Overlays
        const now = Date.now();
        ['q', 'e'].forEach(key => {
            const overlay = document.getElementById(`${key}-cd`);
            if (overlay) {
                const isWaiting = me.cooldowns[key.toUpperCase()] > now;
                overlay.style.height = isWaiting ? "100%" : "0%";
            }
        });
    }
});

// --- INPUT HANDLING ---

window.addEventListener('mousemove', (e) => { 
    mousePos.x = e.clientX; 
    mousePos.y = e.clientY; 
});

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    
    // Movement Keys
    if (keys.hasOwnProperty(key)) {
        keys[key] = true;
    }
    
    // Ability Keys
    if (key === 'q' || key === 'e') {
        socket.emit('useAbility', key.toUpperCase());
    }
});

window.addEventListener('keyup', (e) => { 
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
        keys[key] = false; 
    }
});

canvas.addEventListener('mousedown', () => { 
    if (isPlaying) {
        socket.emit('attack');
    }
});

// Movement heartbeat (Sends movement data to server 33 times per second)
setInterval(() => {
    if (isPlaying && players[myId]) {
        const me = players[myId];
        
        // Calculate the angle from player to mouse for aiming
        const worldMouseX = (mousePos.x / zoom) + camX;
        const worldMouseY = (mousePos.y / zoom) + camY;
        const angle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
        
        socket.emit('move', { keys, angle });
    }
}, 30);

// --- RENDERING ENGINE ---

function drawLoop() {
    if (!isPlaying || !players[myId]) {
        return requestAnimationFrame(drawLoop);
    }

    const me = players[myId];
    
    // Calculate Viewport dimensions
    const viewportWidth = canvas.width / zoom;
    const viewportHeight = canvas.height / zoom;

    // Smooth Camera Follow
    camX = Math.max(0, Math.min(me.x - viewportWidth / 2, WORLD_SIZE - viewportWidth));
    camY = Math.max(0, Math.min(me.y - viewportHeight / 2, WORLD_SIZE - viewportHeight));

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // 1. Draw Background
    if (rooms[me.room]) {
        ctx.fillStyle = rooms[me.room].bg;
        ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    }

    // 2. Draw NPC: Master Blacksmith
    if (me.room === 'shop') {
        ctx.fillStyle = "#f1c40f"; // Gold color
        ctx.fillRect(1000 - 40, 1000 - 40, 80, 80);
        
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = "bold 24px Arial";
        ctx.fillText("MASTER BLACKSMITH", 1000, 940);
        ctx.font = "16px Arial";
        ctx.fillText("Welcome to the Forge!", 1000, 965);
    }

    // 3. Draw Portals
    portals.forEach(portal => {
        if (portal.fromRoom === me.room) {
            // Portal Outer Glow
            ctx.fillStyle = portal.color;
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.arc(portal.x, portal.y, 75, 0, Math.PI * 2);
            ctx.fill();
            
            // Portal Core
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(portal.x, portal.y, 45, 0, Math.PI * 2);
            ctx.fill();
            
            // Portal Label
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 28px Arial";
            ctx.fillText(portal.label, portal.x, portal.y - 100);
        }
    });

    // 4. Draw Monsters
    monsters.forEach(monster => {
        if (monster.room === me.room && monster.isAlive) {
            // Monster Body
            ctx.fillStyle = "#e74c3c";
            ctx.beginPath();
            ctx.arc(monster.x, monster.y, 40, 0, Math.PI * 2);
            ctx.fill();
            
            // Monster HP Bar
            ctx.fillStyle = "black";
            ctx.fillRect(monster.x - 35, monster.y - 65, 70, 8);
            ctx.fillStyle = "#2ecc71";
            const hpPercent = monster.hp / monster.maxHp;
            ctx.fillRect(monster.x - 35, monster.y - 65, hpPercent * 70, 8);
        }
    });

    // 5. Draw Projectiles
    projectiles.forEach(p => {
        if (p.room === me.room) {
            ctx.fillStyle = p.isSpecial ? "white" : "yellow";
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.isSpecial ? 16 : 8, 0, Math.PI * 2);
            ctx.fill();
            
            // Add a slight trail for specials
            if (p.isSpecial) {
                ctx.strokeStyle = "rgba(255,255,255,0.3)";
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        }
    });

    // 6. Draw Players
    for (let id in players) {
        const p = players[id];
        if (p.room === me.room) {
            ctx.fillStyle = p.color;
            
            // Render specific shapes based on class
            if (p.charClass === 'Warrior') {
                ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
            } else if (p.charClass === 'Archer') {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - 35);
                ctx.lineTo(p.x - 30, p.y + 25);
                ctx.lineTo(p.x + 30, p.y + 25);
                ctx.closePath();
                ctx.fill();
            } else if (p.charClass === 'Mage') {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Draw Player Name
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.font = "bold 22px Arial";
            ctx.fillText(p.name, p.x, p.y - 55);
        }
    }

    ctx.restore();
    requestAnimationFrame(drawLoop);
}
