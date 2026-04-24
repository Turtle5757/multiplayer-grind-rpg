const socket = io();

// ===================== STATE =====================
let me = null;
let players = {};
let monsters = [];
let projectiles = [];
let portals = [];

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ===================== INPUT =====================
let keys = { w: false, a: false, s: false, d: false };
let mouseX = 0;
let mouseY = 0;

// Default bindings (Q/E)
let myBinds = { Q: "start", E: "ult" };

// ===================== RESIZE =====================
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ===================== SOCKET INIT =====================
socket.on("init", (data) => {
    portals = data.portals || [];
    requestAnimationFrame(draw);
});

// ===================== GAME UPDATE =====================
socket.on("update", (data) => {
    players = data.players || {};
    monsters = data.monsters || [];
    projectiles = data.projectiles || [];

    me = players[socket.id] || null;

    if (me) updateHUD();
});

// ===================== CONTINUOUS MOVEMENT =====================
setInterval(() => {
    if (!me) return;
    socket.emit("move", { keys });
}, 1000 / 30);

// ===================== INPUT =====================
window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();

    if (keys.hasOwnProperty(k)) {
        keys[k] = true;
    }

    const bindKey = e.key.toUpperCase();

    if (myBinds[bindKey] && me) {
        const skillId = myBinds[bindKey];

        const camX = me.x - canvas.width / 2;
        const camY = me.y - canvas.height / 2;

        socket.emit("useAbility", {
            key: bindKey,
            skillId,
            targetX: mouseX + camX,
            targetY: mouseY + camY
        });
    }
});

window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
});

window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// ===================== ATTACK =====================
window.addEventListener("mousedown", (e) => {
    if (!me) return;

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    socket.emit("attack", {
        x: e.clientX + camX,
        y: e.clientY + camY
    });
});

// ===================== HUD =====================
function updateHUD() {
    document.getElementById("hp-bar").style.width =
        (me.hp / me.maxHp) * 100 + "%";

    document.getElementById("mana-bar").style.width =
        (me.mana / me.maxMana) * 100 + "%";

    document.getElementById("gold-display").innerText =
        `Gold: ${Math.floor(me.gold)}`;

    document.getElementById("stats-text").innerText =
        `LVL: ${me.level} | XP: ${me.xp}/${me.xpToNext} | STR: ${me.str.toFixed(1)}`;
}

// ===================== DRAW LOOP =====================
function draw() {
    if (!me) {
        requestAnimationFrame(draw);
        return;
    }

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // BACKGROUND
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ===================== PORTALS =====================
    portals.forEach(p => {
        if (p.fromRoom !== me.room) return;

        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, 40, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText(p.label, p.x - camX, p.y - camY - 50);
    });

    // ===================== MONSTERS =====================
    monsters.forEach(m => {
        if (m.room !== me.room) return;

        ctx.fillStyle = "#8e44ad";
        ctx.beginPath();
        ctx.arc(m.x - camX, m.y - camY, 30, 0, Math.PI * 2);
        ctx.fill();
    });

    // ===================== PROJECTILES =====================
    projectiles.forEach(p => {
        if (p.room !== me.room) return;

        ctx.fillStyle = p.isAbility ? "#f1c40f" : "#fff";
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    // ===================== PLAYERS =====================
    Object.values(players).forEach(p => {
        if (p.room !== me.room) return;

        ctx.fillStyle = p.id === socket.id ? "#2ecc71" : "#e67e22";
        ctx.fillRect(p.x - camX - 15, p.y - camY - 15, 30, 30);

        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText(p.name, p.x - camX, p.y - camY - 25);

        // HP BAR
        ctx.fillStyle = "red";
        ctx.fillRect(p.x - camX - 15, p.y - camY - 35, 30, 4);
        ctx.fillStyle = "green";
        ctx.fillRect(p.x - camX - 15, p.y - camY - 35, 30 * (p.hp / p.maxHp), 4);
    });

    requestAnimationFrame(draw);
}
