window.socket = io({
    transports: ["websocket"]
});

// ===================== STATE =====================
let me = null;
let players = {};
let monsters = [];
let projectiles = [];
let portals = [];

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// camera
let camX = 0;
let camY = 0;

// input
let keys = { w: false, a: false, s: false, d: false };
let mouseX = 0;
let mouseY = 0;

// skill binds
let myBinds = { Q: "start", E: "ult" };

// ===================== INIT =====================
socket.on("connect", () => {
    console.log("Connected:", socket.id);
});

socket.on("init", (data) => {
    portals = data.portals || [];
    me = data.self || null;

    resize();
    window.addEventListener("resize", resize);
});

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// ===================== SERVER UPDATE =====================
socket.on("update", (data) => {
    players = data.players || {};
    monsters = data.monsters || [];
    projectiles = data.projectiles || [];

    me = players[socket.id] || null;

    if (me) {
        updateStatsUI();
        updateSkillTreeUI();
    }
});

// ===================== INPUT =====================
window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();

    if (k in keys) {
        keys[k] = true;
    }

    const bindKey = e.key.toUpperCase();

    if (myBinds[bindKey] && me && me.upgrades[myBinds[bindKey]] > 0) {
        const world = screenToWorld(mouseX, mouseY);

        socket.emit("useAbility", {
            key: bindKey,
            skillId: myBinds[bindKey],
            targetX: world.x,
            targetY: world.y
        });
    }
});

window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();

    if (k in keys) {
        keys[k] = false;
    }
});

// mouse tracking
window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// attack click
window.addEventListener("mousedown", (e) => {
    if (!me) return;
    if (document.getElementById("skill-tree").style.display === "block") return;

    const world = screenToWorld(e.clientX, e.clientY);

    socket.emit("attack", {
        x: world.x,
        y: world.y
    });
});

// ===================== MOVEMENT LOOP =====================
setInterval(() => {
    if (!me) return;

    socket.emit("move", { keys });

}, 1000 / 30);

// ===================== HELPERS =====================
function screenToWorld(x, y) {
    return {
        x: x + camX,
        y: y + camY
    };
}

function toggleMenu(id) {
    const el = document.getElementById(id);
    if (!el) return;

    el.style.display = (el.style.display === "block") ? "none" : "block";
}

function bindSkill(skillId, key) {
    if (!me || me.upgrades[skillId] === 0) return;

    for (let k in myBinds) {
        if (myBinds[k] === skillId) myBinds[k] = null;
    }

    myBinds[key] = skillId;
}

// ===================== UI =====================
function updateStatsUI() {
    if (!me) return;

    document.getElementById("hp-bar").style.width =
        (me.hp / me.maxHp) * 100 + "%";

    document.getElementById("mana-bar").style.width =
        (me.mana / me.maxMana) * 100 + "%";

    document.getElementById("gold-display").innerText =
        "Gold: " + Math.floor(me.gold);

    document.getElementById("stats-text").innerText =
        `LVL ${me.level} | XP ${Math.floor(me.xp)} | PRESTIGE ${me.prestige} | STR ${me.str.toFixed(1)} | DEF ${me.def.toFixed(1)} | SPD ${me.spd.toFixed(2)}`;
}

function updateSkillTreeUI() {
    if (!me) return;

    const names = {
        Warrior: { start: "Slash Wave", ult: "Berserk Rage", a: "Vampirism", b: "Juggernaut" },
        Archer: { start: "Piercing Bolt", ult: "Shadow Dash", a: "Eagle Eye", b: "Multishot" },
        Mage: { start: "Fireball", ult: "Great Heal", a: "Mana Flow", b: "Frost Nova" }
    };

    const s = names[me.charClass];
    if (!s) return;

    document.getElementById("start-skill-name").innerText = s.start;
    document.getElementById("ult-skill-name").innerText = s.ult;
    document.getElementById("skillA-name").innerText = s.a;
    document.getElementById("skillB-name").innerText = s.b;

    document.getElementById("sp-count").innerText = me.skillPoints;
}

// ===================== RENDER =====================
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!me) {
        requestAnimationFrame(draw);
        return;
    }

    // smooth camera
    camX += ((me.x - canvas.width / 2) - camX) * 0.12;
    camY += ((me.y - canvas.height / 2) - camY) * 0.12;

    // background
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // portals
    portals.forEach(p => {
        if (p.fromRoom !== me.room) return;

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = p.color;

        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, 40, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff";
        ctx.fillText(p.label, p.x - camX - 20, p.y - camY - 50);
    });

    // monsters
    monsters.forEach(m => {
        if (!m.isAlive || m.room !== me.room) return;

        ctx.fillStyle = m.isBoss ? "#ff0000" : "#8e44ad";
        ctx.beginPath();
        ctx.arc(m.x - camX, m.y - camY, m.isBoss ? 80 : 30, 0, Math.PI * 2);
        ctx.fill();
    });

    // projectiles
    projectiles.forEach(p => {
        if (p.room !== me.room) return;

        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // players
    Object.values(players).forEach(p => {
        if (p.room !== me.room) return;

        const colors = {
            Warrior: "#e67e22",
            Archer: "#2ecc71",
            Mage: "#9b59b6"
        };

        ctx.fillStyle = colors[p.charClass] || "#fff";
        ctx.fillRect(p.x - camX - 20, p.y - camY - 20, 40, 40);

        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText(p.name, p.x - camX, p.y - camY - 45);
    });

    requestAnimationFrame(draw);
}

draw();
