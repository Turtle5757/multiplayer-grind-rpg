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
// Skills must be unlocked in the tree before these work
let myBinds = {
    'Q': 'start', // Default slot for starting skill
    'E': 'ult'    // Default slot for ultimate
};

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
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = true;

    // Trigger Bound Skills
    const pressed = e.key.toUpperCase();
    if (myBinds[pressed]) {
        const skillId = myBinds[pressed];
        // Only trigger if player has actually unlocked/upgraded the skill
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
    menu.style.display = (menu.style.display === 'none' || menu.style.display === '') ? 'block' : 'none';
}

function bindSkill(skillId, key) {
    if (!me || me.upgrades[skillId] === 0) {
        alert("Unlock this skill first!");
        return;
    }
    // Remove skill from other keys to prevent double-binding
    for (let k in myBinds) {
        if (myBinds[k] === skillId) myBinds[k] = null;
    }
    myBinds[key] = skillId;
    console.log(`${skillId} bound to ${key}`);
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

    // Direct Class-to-Name Mapping
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

// --- RENDERING ENGINE ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!me) {
        requestAnimationFrame(draw);
        return;
    }

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    // 1. Draw World / Floor
    ctx.fillStyle = '#111'; 
    ctx.fillRect(-camX, -camY, 2000, 2000); 

    // 2. Draw Portals (Filtered by current room)
    portals.forEach(p => {
        if (p.fromRoom === me.room) {
            ctx.beginPath();
            ctx.arc(p.x - camX, p.y - camY, 40, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.6;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = "#fff";
            ctx.textAlign = 'center';
            ctx.fillText(p.label, p.x - camX, p.y - camY - 50);
        }
    });

    // 3. Draw Monsters (Filtered by current room)
    monsters.forEach(m => {
        if (!m.isAlive || m.room !== me.room) return;
        ctx.fillStyle = m.isBoss ? '#ff0000' : '#8e44ad';
        ctx.beginPath();
        ctx.arc(m.x - camX, m.y - camY, m.isBoss ? 80 : 30, 0, Math.PI * 2);
        ctx.fill();
        
        // Monster Health Bar
        ctx.fillStyle = '#444';
        ctx.fillRect(m.x - camX - 30, m.y - camY - 50, 60, 6);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(m.x - camX - 30, m.y - camY - 50, (m.hp / m.maxHp) * 60, 6);
    });

    // 4. Draw Projectiles (Filtered by current room)
    projectiles.forEach(p => {
        if (p.room !== me.room) return;
        ctx.fillStyle = p.isSpecial ? '#f1c40f' : '#ecf0f1';
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, p.isSpecial ? 8 : 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // 5. Draw Players (Filtered by current room)
    Object.values(players).forEach(p => {
        if (p.room !== me.room) return;

        ctx.save();
        ctx.translate(p.x - camX, p.y - camY);
        ctx.rotate(p.angle);
        
        // Static Colors Based on Class
        if (p.charClass === 'Warrior') ctx.fillStyle = '#e67e22';
        else if (p.charClass === 'Archer') ctx.fillStyle = '#2ecc71';
        else if (p.charClass === 'Mage') ctx.fillStyle = '#9b59b6';
        else ctx.fillStyle = '#fff';

        ctx.fillRect(-20, -20, 40, 40);
        ctx.restore();

        // UI: Name & Health
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = "14px Arial";
        ctx.fillText(p.name, p.x - camX, p.y - camY - 45);
        
        ctx.fillStyle = '#333';
        ctx.fillRect(p.x - camX - 25, p.y - camY - 35, 50, 6);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(p.x - camX - 25, p.y - camY - 35, (p.hp / p.maxHp) * 50, 6);
    });

    requestAnimationFrame(draw);
}

draw();
