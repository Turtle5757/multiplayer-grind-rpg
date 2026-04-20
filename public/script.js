function draw() {
    ctx.fillStyle = '#2e3d23'; // Grass color
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. DRAW ZONES
    const zoneColors = { gym: '#555', track: '#8b4513', lake: '#4682b4' };
    for (let key in zones) {
        let z = zones[key];
        ctx.fillStyle = zoneColors[key];
        ctx.globalAlpha = 0.5;
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = 'white';
        ctx.fillText(key.toUpperCase() + " (TRAIN " + key + ")", z.x + 10, z.y + 20);
    }

    // 2. DRAW MONSTERS (Make them look like Slimes)
    monsters.forEach(m => {
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, 25, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = 'black';
        ctx.fillRect(m.x - 10, m.y - 5, 4, 4);
        ctx.fillRect(m.x + 6, m.y - 5, 4, 4);
    });

    // 3. DRAW PLAYERS (With Faces and Direction)
    for (let id in players) {
        let p = players[id];
        
        // Body
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'black';
        ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
        ctx.shadowBlur = 0;

        // Face (Eyes look where you move)
        ctx.fillStyle = 'white';
        ctx.fillRect(p.x - 8, p.y - 5, 6, 6);
        ctx.fillRect(p.x + 2, p.y - 5, 6, 6);
        ctx.fillStyle = 'black';
        ctx.fillRect(p.x - 6, p.y - 3, 3, 3);
        ctx.fillRect(p.x + 4, p.y - 3, 3, 3);

        // Name Tag & Zone Status
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(`${p.name} (Lv.${p.level})`, p.x, p.y - 25);
        if (p.currentZone) {
            ctx.fillStyle = '#47ff47';
            ctx.fillText(`TRAINING ${p.currentZone.toUpperCase()}!`, p.x, p.y + 35);
        }
    }
    requestAnimationFrame(draw);
}
