const socket = io();

// --- GAME STATE ---
let me = null;
let players = {};
let monsters = [];
let projectiles = [];
let portals = [];
let canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d');

// --- DYNAMIC KEY BINDS ---
let myBinds = { 'Q': 'start', 'E': 'ult' };

// --- INPUT TRACKING ---
let keys = { w: false, a: false, s: false, d: false };
let mouseX = 0;
let mouseY = 0;

// --- INITIALIZATION ---
socket.on('init', (data) => {
    portals = data.portals;
    window.addEventListener('resize', resize);
    resize();
});

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// --- CORE UPDATE LOOP ---
socket.on('update', (data) => {
    players = data.players;
    monsters = data.monsters;
    projectiles = data.projectiles;
    me = players[socket.id];

    if (me) {
        updateStatsUI();
        updateSkillTreeUI();
    }
});

// --- INPUT LISTENERS ---

// Movement Keys
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) {
        keys[k] = true;
        sendMove();
    }

    // Ability Usage (Q/E)
    const pressed = e.key.toUpperCase();
    if (myBinds[pressed]) {
        const skillId = myBinds[pressed];
        if (me && me.upgrades[skillId] > 0) {
            // Send world coordinates of mouse so ability fires toward cursor
            const camX = me.x - canvas.width / 2;
            const camY = me.y - canvas.height / 2;
            socket.emit('useAbility', { 
                key: pressed, 
                skillId: skillId,
                targetX: mouseX + camX,
                targetY: mouseY + camY
            });
        }
    }
});

window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) {
        keys[k] = false;
        sendMove();
    }
});

// Cursor Tracking
window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Click to Attack
window.addEventListener('mousedown', (e) => {
    if (!me || document.getElementById('skill-tree').style.display === 'block') return;
    
    // Calculate World Coordinates (Player Position + Offset from Screen Center)
    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;
    
    socket.emit('attack', { 
        x: e.clientX + camX, 
        y: e.clientY + camY 
    });
});

function sendMove() {
    if (!me) return;
    socket.emit('move', { keys });
}

// --- UI HELPERS ---
function toggleMenu(id) {
    const menu = document.getElementById(id);
    menu.style.display = (menu.style.display === 'none' || menu.style.display === '') ? 'block' : 'none';
}

function bindSkill(skillId, key) {
    if (!me || me.upgrades[skillId] === 0) return;
    for (let k in myBinds) { if (myBinds[k] === skillId) myBinds[k] = null; }
    myBinds[key] = skillId;
}

function updateStatsUI() {
    document.getElementById('hp-bar').style.width = (me.hp / me.maxHp * 100) + '%';
    document.getElementById('mana-bar').style.width = (me.mana / me.maxMana * 100) + '%';
    document.getElementById('gold-display').innerText = `Gold: ${Math.floor(me.gold)}`;
    document.getElementById('stats-text').innerText = 
        `STR: ${me.str.toFixed(1)} | DEF: ${me.def.toFixed(1)} | SPD: ${me.spd.toFixed(2)}`;
}

function updateSkillTreeUI() {
    const spCount = document.getElementById('sp-count');
    if (spCount) spCount.innerText = me.skillPoints;

    const skillNames = {
        Warrior: { start: "Slash Wave", ult: "Berserk Rage", a: "Vampirism", b: "Juggernaut" },
        Archer: { start: "Piercing Bolt", ult: "Shadow Dash", a: "Eagle Eye", b: "Multishot" },
        Mage: { start: "Fireball", ult: "Great Heal", a: "Mana Flow", b: "Frost Nova" }
    };

    const currentClassSkills = skillNames[me.charClass];
    if (currentClassSkills) {
        document.getElementById('start-skill-name').innerText = currentClassSkills.start;
        document.getElementById('ult-skill-name').innerText = currentClassSkills.ult;
        document.getElementById('skillA-name').innerText = currentClassSkills.a;
        document.getElementById('skillB-name').innerText = currentClassSkills.b;
    }

    document.getElementById('skillA-lv').innerText = me.upgrades.branchA;
    document.getElementById('skillB-lv').innerText = me.upgrades.branchB;
}

// --- RENDERING ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!me) {
        requestAnimationFrame(draw);
        return;
    }

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Portals
    portals.forEach(p => {
        if (p.fromRoom === me.room) {
            ctx.beginPath();
            ctx.arc(p.x - camX, p.y - camY, 40, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.5;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = "#fff";
            ctx.fillText(p.label, p.x - camX - 20, p.y - camY - 50);
        }
    });

    // Monsters
    monsters.forEach(m => {
        if (!m.isAlive || m.room !== me.room) return;
        ctx.fillStyle = m.isBoss ? '#ff0000' : '#8e44ad';
        ctx.beginPath();
        ctx.arc(m.x - camX, m.y - camY, m.isBoss ? 80 : 30, 0, Math.PI * 2);
        ctx.fill();
    });

    // Projectiles
    projectiles.forEach(p => {
        if (p.room !== me.room) return;
        ctx.fillStyle = p.isSpecial ? '#f1c40f' : '#fff';
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, p.isSpecial ? 8 : 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Players (No Rotation)
    Object.values(players).forEach(p => {
        if (p.room !== me.room) return;

        const colors = { Warrior: '#e67e22', Archer: '#2ecc71', Mage: '#9b59b6' };
        ctx.fillStyle = colors[p.charClass] || '#fff';
        ctx.fillRect(p.x - camX - 20, p.y - camY - 20, 40, 40);

        // Name & Health
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x - camX, p.y - camY - 45);
        ctx.fillStyle = '#f00';
        ctx.fillRect(p.x - camX - 20, p.y - camY - 35, 40, 4);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(p.x - camX - 20, p.y - camY - 35, (p.hp / p.maxHp) * 40, 4);
    });

    requestAnimationFrame(draw);
}

draw();
