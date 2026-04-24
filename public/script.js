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
// These are stored locally and sent to the server when triggered
let keyBinds = {
    'Q': 'start', // Initial default: Q triggers Starting Skill
    'E': 'ult'    // Initial default: E triggers Ultimate
};

// --- INPUT TRACKING ---
let keys = { w: false, a: false, s: false, d: false };
let mouseX = 0;
let mouseY = 0;

// --- INITIALIZATION ---
socket.on('init', (data) => {
    const myId = data.id;
    portals = data.portals;
    
    // Resize canvas to fill window
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
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = true;

    // Trigger Activated Abilities based on Binds
    const pressed = e.key.toUpperCase();
    if (keyBinds[pressed]) {
        const skillId = keyBinds[pressed];
        // Only send if the skill is actually unlocked in the tree
        if (me && me.upgrades[skillId] > 0) {
            socket.emit('useAbility', { key: pressed, skillId: skillId });
        }
    }
    
    sendMove();
});

window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
    sendMove();
});

window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    sendMove();
});

window.addEventListener('mousedown', () => {
    socket.emit('attack');
});

function sendMove() {
    if (!me) return;
    const angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
    socket.emit('move', { keys, angle });
}

// --- UI & SKILL TREE LOGIC ---
function toggleMenu(id) {
    const menu = document.getElementById(id);
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function bindSkill(skillId, key) {
    if (!me || me.upgrades[skillId] === 0) {
        alert("You must unlock this skill in the tree first!");
        return;
    }
    // Swap binds if the key was already used elsewhere
    for (let k in keyBinds) {
        if (keyBinds[k] === skillId) delete keyBinds[k];
    }
    keyBinds[key] = skillId;
    alert(`Skill bound to ${key}!`);
}

function updateStatsUI() {
    document.getElementById('hp-bar').style.width = (me.hp / me.maxHp * 100) + '%';
    document.getElementById('mana-bar').style.width = (me.mana / me.maxMana * 100) + '%';
    document.getElementById('gold-display').innerText = `Gold: ${Math.floor(me.gold)}`;
    document.getElementById('stats-text').innerText = 
        `STR: ${me.str.toFixed(1)} | DEF: ${me.def.toFixed(1)} | SPD: ${me.spd.toFixed(2)}`;
}

function updateSkillTreeUI() {
    const spElement = document.getElementById('sp-count');
    if (spElement) spElement.innerText = me.skillPoints;

    // Define class-specific names for the UI
    const classNames = {
        Warrior: { start: "Slash Wave", ult: "Berserk Rage", a: "Vampirism", b: "Iron Skin" },
        Archer: { start: "Power Shot", ult: "Wind Step", a: "Eagle Eye", b: "Volley" },
        Mage: { start: "Fireball", ult: "Life Transfuse", a: "Mana Flow", b: "Frost Nova" }
    };

    const names = classNames[me.charClass];
    
    // Update Labels
    document.getElementById('start-skill-name').innerText = names.start;
    document.getElementById('ult-skill-name').innerText = names.ult;
    document.getElementById('skillA-name').innerText = names.a;
    document.getElementById('skillB-name').innerText = names.b;

    // Update Levels
    document.getElementById('skillA-lv').innerText = me.upgrades.branchA;
    document.getElementById('skillB-lv').innerText = me.upgrades.branchB;
}

// --- RENDERING ENGINE ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!me) {
        requestAnimationFrame(draw);
        return;
    }

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    // 1. Draw World/Floor
    ctx.fillStyle = '#1a1a1a'; // Dark void outside
    ctx.fillRect(-camX, -camY, 2000, 2000); 

    // 2. Draw Portals
    portals.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, 40, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "#fff";
        ctx.fillText(p.label, p.x - camX - 20, p.y - camY - 50);
    });

    // 3. Draw Monsters
    monsters.forEach(m => {
        if (!m.isAlive) return;
        ctx.fillStyle = m.isBoss ? '#ff0000' : '#8e44ad';
        ctx.beginPath();
        ctx.arc(m.x - camX, m.y - camY, m.isBoss ? 80 : 30, 0, Math.PI * 2);
        ctx.fill();
        
        // Monster HP Bar
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(m.x - camX - 30, m.y - camY - 50, 60, 8);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(m.x - camX - 30, m.y - camY - 50, (m.hp / m.maxHp) * 60, 8);
    });

    // 4. Draw Projectiles
    projectiles.forEach(p => {
        ctx.fillStyle = p.isSpecial ? '#f1c40f' : '#fff';
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, p.isSpecial ? 8 : 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // 5. Draw Players
    Object.values(players).forEach(p => {
        // Body
        ctx.save();
        ctx.translate(p.x - camX, p.y - camY);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-20, -20, 40, 40);
        
        // Direction indicator (Eyes/Front)
        ctx.fillStyle = '#000';
        ctx.fillRect(10, -10, 5, 5);
        ctx.fillRect(10, 5, 5, 5);
        ctx.restore();

        // Name & Health
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(p.name + ` [${p.charClass}]`, p.x - camX, p.y - camY - 45);
        
        ctx.fillStyle = '#555';
        ctx.fillRect(p.x - camX - 20, p.y - camY - 35, 40, 5);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(p.x - camX - 20, p.y - camY - 35, (p.hp / p.maxHp) * 40, 5);
    });

    requestAnimationFrame(draw);
}

// Start Rendering
draw();
