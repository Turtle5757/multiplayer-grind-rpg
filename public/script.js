const socket = io();

// ===================== GAME STATE =====================
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

// ===================== RESIZE =====================
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ===================== AUTH UI =====================
socket.on("authError", (msg) => {
    const el = document.getElementById("auth-msg");
    el.innerText = msg;
    el.style.color = "red";
});

socket.on("authMessage", (msg) => {
    const el = document.getElementById("auth-msg");
    el.innerText = msg;
    el.style.color = "lime";
});

socket.on("init", (data) => {
    portals = data.portals || [];
    document.getElementById("auth-overlay").style.display = "none";
});

// ===================== GLOBAL FUNCTIONS (FIX FOR HTML BUTTONS) =====================
window.register = function () {
    socket.emit("register", {
        name: document.getElementById("username").value,
        password: document.getElementById("password").value,
        charClass: document.getElementById("charClass").value
    });
};

window.login = function () {
    socket.emit("login", {
        name: document.getElementById("username").value,
        password: document.getElementById("password").value
    });
};

window.toggleSkillTree = function () {
    const el = document.getElementById("skill-tree");
    el.style.display = (el.style.display === "block") ? "none" : "block";
};

// ===================== SERVER UPDATE =====================
socket.on("update", (data) => {
    players = data.players || {};
    monsters = data.monsters || [];
    projectiles = data.projectiles || [];

    me = players[socket.id];

    if (me) {
        updateUI();
    }
});

// ===================== INPUT HANDLING =====================
window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();

    if (keys.hasOwnProperty(k)) {
        keys[k] = true;
        sendMove();
    }

    // abilities Q/E
    const up = e.key.toUpperCase();
    if (up === "Q" || up === "E") {
        socket.emit("attack", { x: mouseX, y: mouseY });
    }
});

window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) {
        keys[k] = false;
        sendMove();
    }
});

window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

window.addEventListener("mousedown", (e) => {
    if (!me) return;

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    socket.emit("attack", {
        x: e.clientX + camX,
        y: e.clientY + camY
    });
});

function sendMove() {
    if (!me) return;
    socket.emit("move", { keys });
}

// ===================== UI =====================
function updateUI() {
    document.getElementById("hp-bar").style.width =
        (me.hp / me.maxHp) * 100 + "%";

    document.getElementById("mana-bar").style.width =
        (me.mana / me.maxMana) * 100 + "%";

    document.getElementById("gold-display").innerText =
        "Gold: " + Math.floor(me.gold);

    document.getElementById("stats-text").innerText =
        `STR: ${me.str} | DEF: ${me.def} | SPD: ${me.spd}`;

    document.getElementById("sp-count").innerText = me.skillPoints || 0;

    document.getElementById("skillA-lv").innerText = me.upgrades.branchA || 0;
    document.getElementById("skillB-lv").innerText = me.upgrades.branchB || 0;
}

// ===================== RENDER LOOP =====================
function draw() {
    requestAnimationFrame(draw);

    if (!me) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // PORTALS
    portals.forEach(p => {
        if (p.fromRoom !== me.room) return;

        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, 40, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#fff";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(p.label, p.x - camX, p.y - camY - 50);
    });

    // MONSTERS
    monsters.forEach(m => {
        if (!m.alive || m.room !== me.room) return;

        ctx.fillStyle = m.id === "BOSS" ? "red" : "purple";
        ctx.beginPath();
        ctx.arc(m.x - camX, m.y - camY, m.id === "BOSS" ? 60 : 25, 0, Math.PI * 2);
        ctx.fill();
    });

    // PROJECTILES
    projectiles.forEach(p => {
        if (p.room !== me.room) return;

        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // PLAYERS
    Object.values(players).forEach(p => {
        if (p.room !== me.room) return;

        // Highlight your player in lime green
        if (p.id === socket.id) {
            ctx.fillStyle = "#00ff00";
        } else {
            ctx.fillStyle = "orange";
        }

        ctx.fillRect(p.x - camX - 15, p.y - camY - 15, 30, 30);

        ctx.fillStyle = "white";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(p.name, p.x - camX, p.y - camY - 25);
    });
}

draw();
