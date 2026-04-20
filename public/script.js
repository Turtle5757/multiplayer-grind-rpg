let myRoom = 'hub';

socket.on('update', data => { 
    players = data.players; monsters = data.monsters; 
    if (isPlaying && players[myId]) {
        myRoom = players[myId].room; // Track which room the player is in
        updateGUI(players[myId]);
        localStorage.setItem('rpg_user_' + players[myId].name, JSON.stringify(players[myId]));
    }
});

function draw() {
    // 1. Draw Background based on room
    ctx.fillStyle = rooms[myRoom] ? rooms[myRoom].color : '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Room Labels & Exit Signs
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "20px Courier New";
    ctx.textAlign = "center";
    ctx.fillText(`Current Area: ${rooms[myRoom].name}`, canvas.width/2, 30);
    
    // Draw Portals/Exits
    ctx.fillStyle = "white";
    if (myRoom === 'hub') {
        ctx.fillText("↑ SPEEDWAY", 400, 20);
        ctx.fillText("↓ GYM", 400, 580);
        ctx.fillText("← LAKE", 50, 300);
        ctx.fillText("→ DUNGEON", 750, 300);
    } else {
        ctx.fillText("BACK TO HUB", 400, 580);
    }

    // 3. Draw Monsters (ONLY if in the same room)
    monsters.forEach(m => {
        if (m.room === myRoom && m.isAlive) {
            ctx.fillStyle = '#ff0000';
            ctx.beginPath(); ctx.arc(m.x, m.y, 25, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'white';
            ctx.fillText(`HP: ${Math.ceil(m.hp)}`, m.x, m.y - 35);
        }
    });

    // 4. Draw Players (ONLY if in the same room)
    for (let id in players) {
        let p = players[id];
        if (p.room === myRoom) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
            
            // lil eyes
            ctx.fillStyle = 'white';
            ctx.fillRect(p.x - 8, p.y - 8, 5, 5); ctx.fillRect(p.x + 3, p.y - 8, 5, 5);
            
            ctx.fillStyle = 'white';
            ctx.fillText(p.name, p.x, p.y - 25);
            if (rooms[p.room].stat) ctx.fillText("TRAINING...", p.x, p.y + 35);
        }
    }
    requestAnimationFrame(draw);
}
