/* ═══════════════════════════════════════════════════════════════════
   RENDER: HOTBAR ICONS
   renderIcon() draws the small preview icon shown in the build hotbar
   and category popup for each placeable type.
   ═══════════════════════════════════════════════════════════════════ */

// Render tiny icon previews into hotbar button canvases
RenderSystem.renderIcon = function (iconCanvas, type) {
      const c = iconCanvas.getContext('2d');
      const W = iconCanvas.width;
      const H = iconCanvas.height;
      c.clearRect(0, 0, W, H);

      if (type === T.SOLAR) {
        c.strokeStyle = '#4090d0';
        c.lineWidth   = 1;
        c.strokeRect(4, 4, W-8, H-8);
        const cw = (W-8)/3, ch = (H-8)/3;
        for (let ci=0;ci<3;ci++) for (let ri=0;ri<3;ri++) {
          c.fillStyle = `rgba(64,160,255,0.3)`;
          c.fillRect(4+ci*cw+0.5, 4+ri*ch+0.5, cw-1, ch-1);
        }
      } else if (type === T.SUBSTATION) {
        c.strokeStyle = '#2060a0';
        c.lineWidth   = 1.5;
        c.strokeRect(3, 3, W-6, H-6);
        c.strokeStyle = '#40a0ff';
        c.beginPath(); c.moveTo(W/2,4); c.lineTo(W/2-4,H/2); c.lineTo(W/2+2,H/2);
        c.lineTo(W/2-3,H-6); c.lineTo(W/2+5,H/2-4); c.lineTo(W/2,H/2-4); c.closePath();
        c.fillStyle='rgba(64,160,255,0.6)'; c.fill();
      } else if (type === T.SUBSTATION2) {
        c.strokeStyle = '#1848c0';
        c.lineWidth   = 2;
        c.strokeRect(3, 3, W-6, H-6);
        c.strokeStyle = '#60c0ff';
        c.beginPath(); c.moveTo(W/2,3); c.lineTo(W/2-5,H/2); c.lineTo(W/2+3,H/2);
        c.lineTo(W/2-4,H-5); c.lineTo(W/2+6,H/2-5); c.lineTo(W/2+1,H/2-5); c.closePath();
        c.fillStyle='rgba(80,180,255,0.7)'; c.fill();
        c.font='bold 6px sans-serif'; c.fillStyle='rgba(80,180,255,0.9)';
        c.textAlign='right'; c.fillText('2', W-4, H-3); c.textAlign='left';
      } else if (type === T.SUBSTATION5) {
        c.strokeStyle = '#c89030';
        c.lineWidth   = 2;
        c.strokeRect(3, 3, W-6, H-6);
        const g = c.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.min(W,H)*0.2);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#ffd060'); g.addColorStop(1, 'rgba(255,160,40,0)');
        c.fillStyle = g; c.beginPath(); c.arc(W/2, H/2, Math.min(W,H)*0.2, 0, Math.PI*2); c.fill();
        c.strokeStyle = 'rgba(255,214,120,0.85)'; c.lineWidth = 1.2;
        c.beginPath(); c.ellipse(W/2, H/2, Math.min(W,H)*0.32, Math.min(W,H)*0.12, 0.5, 0, Math.PI*2); c.stroke();
        c.beginPath(); c.ellipse(W/2, H/2, Math.min(W,H)*0.32, Math.min(W,H)*0.12, -0.6, 0, Math.PI*2); c.stroke();
        c.font='bold 6px sans-serif'; c.fillStyle='rgba(255,214,120,0.95)';
        c.textAlign='right'; c.fillText('5', W-4, H-3); c.textAlign='left';
      } else if (type === T.SUBSTATION4) {
        c.strokeStyle = '#7a60e0';
        c.lineWidth   = 2;
        c.strokeRect(3, 3, W-6, H-6);
        c.strokeStyle = 'rgba(190,170,255,0.85)';
        c.lineWidth   = 1.5;
        c.beginPath(); c.ellipse(W/2, H/2, Math.min(W,H)*0.32, Math.min(W,H)*0.24, 0, 0, Math.PI*2); c.stroke();
        c.fillStyle = 'rgba(230,220,255,0.95)';
        c.beginPath(); c.arc(W/2, H/2, Math.min(W,H)*0.1, 0, Math.PI*2); c.fill();
        for (const [qx, qy] of [[6, 6], [W-6, 6], [6, H-6], [W-6, H-6]]) { c.beginPath(); c.arc(qx, qy, 1.8, 0, Math.PI*2); c.fill(); }
        c.font='bold 6px sans-serif'; c.fillStyle='rgba(200,180,255,0.95)';
        c.textAlign='right'; c.fillText('4', W-4, H-3); c.textAlign='left';
      } else if (type === T.SUBSTATION3) {
        c.strokeStyle = '#2070e0';
        c.lineWidth   = 2;
        c.strokeRect(3, 3, W-6, H-6);
        c.strokeStyle = 'rgba(128,224,255,0.8)';
        c.lineWidth   = 1.5;
        c.beginPath(); c.arc(W/2, H/2, Math.min(W,H)*0.3, 0, Math.PI*2); c.stroke();
        c.beginPath(); c.moveTo(W/2+1,6); c.lineTo(W/2-5,H/2+1); c.lineTo(W/2+1,H/2+1);
        c.lineTo(W/2-2,H-6); c.lineTo(W/2+6,H/2-3); c.lineTo(W/2+1,H/2-3); c.closePath();
        c.fillStyle='rgba(160,235,255,0.85)'; c.fill();
        c.font='bold 6px sans-serif'; c.fillStyle='rgba(128,224,255,0.95)';
        c.textAlign='right'; c.fillText('3', W-4, H-3); c.textAlign='left';
      } else if (type === T.HAULER) {
        // Mini Hauler: blue cab, steel tank body with bands
        c.fillStyle = '#2a6a9a';
        c.beginPath(); c.roundRect(4, 2, W-8, H*0.3, 2); c.fill();
        c.fillStyle = 'rgba(160,220,255,0.55)';
        c.beginPath(); c.roundRect(5, 3, W-10, H*0.15, 1); c.fill();
        const tg = c.createLinearGradient(4, 0, W-4, 0);
        tg.addColorStop(0, '#6a7480'); tg.addColorStop(0.5, '#dfe5ea'); tg.addColorStop(1, '#6a7480');
        c.fillStyle = tg;
        c.beginPath(); c.roundRect(4, H*0.35, W-8, H*0.6, 4); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.3)';
        for (let i = 1; i < 4; i++) c.fillRect(4, H*0.35 + i*H*0.15, W-8, 1);
        c.strokeStyle = '#143a58'; c.lineWidth = 1; c.strokeRect(3, 1, W-6, H-2);
      } else if (type === T.TRUCK) {
        // Mini truck icon — green cab on top, brown cargo below
        c.fillStyle = '#3a6e28';
        c.beginPath(); c.roundRect(4, 2, W-8, H*0.38, 2); c.fill();
        c.fillStyle = 'rgba(160,220,255,0.5)';
        c.beginPath(); c.roundRect(5, 3, W-10, H*0.2, 1); c.fill();
        const segH2 = (H*0.58) / 3;
        for (let i=0;i<3;i++) {
          c.fillStyle = i%2===0?'#7a5030':'#6e4828';
          c.beginPath(); c.roundRect(4, H*0.42+i*segH2, W-8, segH2-1, 2); c.fill();
          if (i<2) { c.fillStyle='#221810'; c.fillRect(4, H*0.42+(i+1)*segH2-1, W-8, 2); }
        }
        c.strokeStyle='#204010'; c.lineWidth=1; c.strokeRect(3,1,W-6,H-2);
      } else if (type === T.ROAD) {
        c.fillStyle = '#1a1a1a';
        c.beginPath(); c.roundRect(2, 2, W-4, H-4, 2); c.fill();
        c.strokeStyle = '#888'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(7, 3); c.lineTo(7, H-3); c.stroke();
        c.beginPath(); c.moveTo(W-7, 3); c.lineTo(W-7, H-3); c.stroke();
        c.strokeStyle = '#f0d030'; c.lineWidth = 1.5; c.setLineDash([3, 3]);
        c.beginPath(); c.moveTo(W/2, 3); c.lineTo(W/2, H-3); c.stroke();
        c.setLineDash([]);
        c.strokeStyle = '#333'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(2, 2, W-4, H-4, 2); c.stroke();
      } else if (type === T.BRIDGE) {
        // Steel truss deck seen from above across a strip of water
        c.fillStyle = '#1e5a7a'; c.fillRect(1, 1, W-2, H-2);
        c.fillStyle = 'rgba(160,220,255,0.35)';
        for (const [wx, wy] of [[3, 6], [W-7, 11], [4, H-8], [W-7, H-5]]) c.fillRect(wx, wy, 3, 1);
        c.fillStyle = 'rgba(0,10,22,0.4)'; c.fillRect(W*0.24 + 3, 3, W*0.52, H);   // shadow on the water
        c.fillStyle = '#4a5258'; c.fillRect(W*0.24, 0, W*0.52, H);                // tread-plate deck
        c.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 4; y < H; y += 7) c.fillRect(W*0.28, y, W*0.44, 1);
        c.strokeStyle = '#5f7682'; c.lineWidth = 1.6;                              // trusses
        for (const x of [W*0.22, W*0.78]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
        c.lineWidth = 1;
        c.beginPath();
        for (let y = 0; y < H; y += 8) { c.moveTo(W*0.22, y); c.lineTo(W*0.78, y + 8); c.moveTo(W*0.78, y); c.lineTo(W*0.22, y + 8); }
        c.strokeStyle = 'rgba(150,176,188,0.75)'; c.stroke();
        c.fillStyle = '#9ab0bc'; for (const x of [W*0.22, W*0.78]) c.fillRect(x - 1.6, 0, 0.8, H);
      } else if (type === T.PATHTOOL) {
        // Path tool icon — dashed route line with waypoint dots
        c.strokeStyle = '#f0c030'; c.lineWidth = 2; c.lineCap = 'round';
        c.setLineDash([3, 3]);
        c.beginPath(); c.moveTo(4, H-4); c.lineTo(W/2, H/2); c.lineTo(W-4, 4); c.stroke();
        c.setLineDash([]);
        [[4, H-4],[W/2, H/2],[W-4, 4]].forEach(([px,py]) => {
          c.beginPath(); c.arc(px, py, 3, 0, Math.PI*2);
          c.fillStyle = '#f0c030'; c.fill();
        });
      } else if (type === T.HOUSE) {
        c.strokeStyle = '#806020';
        c.lineWidth   = 1.5;
        c.beginPath(); c.moveTo(4, H/2); c.lineTo(W/2, 4); c.lineTo(W-4, H/2);
        c.lineTo(W-4, H-3); c.lineTo(4, H-3); c.closePath(); c.stroke();
        c.fillStyle = 'rgba(255,200,60,0.15)'; c.fill();
        c.fillStyle = 'rgba(255,200,60,0.5)';
        c.fillRect(W/2-3, H/2+2, 6, 6);
      } else if (type === T.SOLAR2) {
        c.strokeStyle = '#2080c0'; c.lineWidth = 1.5;
        c.strokeRect(2, 2, W-4, H-4);
        const cw2=(W-8)/4, ch2=(H-8)/4;
        for (let ci=0;ci<4;ci++) for (let ri=0;ri<4;ri++) {
          c.fillStyle='rgba(40,180,255,0.4)'; c.fillRect(4+ci*cw2+0.5,4+ri*ch2+0.5,cw2-1,ch2-1);
        }
      } else if (type === T.SOLAR3) {
        // Three tilted tracker rows with gold frames, and the glowing salt tank
        for (let r = 0; r < 3; r++) {
          const y = 4 + r * 7;
          c.fillStyle = '#0c2a58'; c.fillRect(3, y, W - 14, 5);
          c.fillStyle = 'rgba(90,190,255,0.75)'; c.fillRect(4, y + 0.5, W - 16, 1.6);
          c.strokeStyle = '#d8a040'; c.lineWidth = 1; c.strokeRect(3, y, W - 14, 5);
        }
        const tx = W - 6, ty = H - 9;
        c.fillStyle = '#5a4030'; c.fillRect(tx - 4, ty - 6, 8, 12);
        c.beginPath(); c.arc(tx, ty - 6, 4, Math.PI, 0); c.fill();
        c.fillStyle = '#ff9028'; c.fillRect(tx - 2.5, ty - 2, 5, 7);
        c.beginPath(); c.arc(tx, ty - 6, 1.6, 0, Math.PI*2); c.fillStyle = '#ffe080'; c.fill();
      } else if (type === T.WIND) {
        c.strokeStyle = '#60c080'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(W/2,H-4); c.lineTo(W/2,H/2); c.stroke();
        for (let b=0;b<3;b++) {
          const a=(b/3)*Math.PI*2-Math.PI/2;
          c.beginPath(); c.moveTo(W/2,H/2); c.lineTo(W/2+Math.cos(a)*10,H/2+Math.sin(a)*10); c.stroke();
        }
        c.beginPath(); c.arc(W/2,H/2,2.5,0,Math.PI*2); c.fillStyle='#80ffb0'; c.fill();
      } else if (type === T.WIND3) {
        // Tall graphite tower, three long dark blades with cyan edges, glowing hub
        c.strokeStyle = '#5c6870'; c.lineWidth = 2.4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(W/2,H-3); c.lineTo(W/2,H*0.36); c.stroke();
        c.strokeStyle = '#1c3a44'; c.lineWidth = 3; c.beginPath(); c.moveTo(W/2,H-3); c.lineTo(W/2,H-6); c.stroke();
        for (let b=0;b<3;b++) {
          const a=(b/3)*Math.PI*2-Math.PI/2+0.3;
          c.strokeStyle = '#2a343c'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(W/2,H*0.34); c.lineTo(W/2+Math.cos(a)*13,H*0.34+Math.sin(a)*13); c.stroke();
          c.strokeStyle = '#48e0ff'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(W/2,H*0.34); c.lineTo(W/2+Math.cos(a)*13,H*0.34+Math.sin(a)*13); c.stroke();
        }
        c.beginPath(); c.arc(W/2,H*0.34,3.2,0,Math.PI*2); c.fillStyle='#a8f4ff'; c.fill();
        c.beginPath(); c.arc(W/2+5,H*0.28,1.2,0,Math.PI*2); c.fillStyle='rgba(255,60,60,0.9)'; c.fill();
      } else if (type === T.WIND2) {
        // Bigger lattice tower with 4 longer blades — reads as heavier-duty than MK1
        c.strokeStyle = '#2a4a50'; c.lineWidth = 1; c.lineCap = 'round';
        c.beginPath(); c.moveTo(W/2-3,H-4); c.lineTo(W/2,H*0.42); c.lineTo(W/2+3,H-4); c.stroke();
        c.beginPath(); c.moveTo(W/2-2,H-4); c.lineTo(W/2+2,H*0.6); c.moveTo(W/2+2,H-4); c.lineTo(W/2-2,H*0.6); c.stroke();
        c.strokeStyle = '#60d8ff'; c.lineWidth = 2;
        for (let b=0;b<4;b++) {
          const a=(b/4)*Math.PI*2;
          c.beginPath(); c.moveTo(W/2,H*0.4); c.lineTo(W/2+Math.cos(a)*11,H*0.4+Math.sin(a)*11); c.stroke();
        }
        c.beginPath(); c.arc(W/2,H*0.4,3,0,Math.PI*2); c.fillStyle='#a0eaff'; c.fill();
        c.beginPath(); c.arc(W/2,5,1.3,0,Math.PI*2); c.fillStyle='rgba(255,60,60,0.9)'; c.fill();
      } else if (type === T.CIRCUITSWITCH) {
        // Breaker cabinet with the knife blade swung open
        c.strokeStyle = '#ffb040'; c.lineWidth = 1.5; c.strokeRect(4, 5, W-8, H-10);
        c.fillStyle = 'rgba(255,176,64,0.10)'; c.fillRect(5, 6, W-10, H-12);
        c.strokeStyle = '#d8c070'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(8, H-10); c.lineTo(W-9, 9); c.stroke();      // blade
        c.fillStyle = '#c8ccc6';
        c.beginPath(); c.arc(8, H-10, 2.2, 0, Math.PI*2); c.fill();           // hinge
        c.fillStyle = '#50e070'; c.fillRect(W-11, H-12, 5, 4);                // contact
      } else if (type === T.CIRCUITSWITCH2) {
        // Bigger cabinet, cyan-lit, three blades instead of one
        c.strokeStyle = '#40d0ff'; c.lineWidth = 1.5; c.strokeRect(3, 4, W-6, H-8);
        c.fillStyle = 'rgba(64,208,255,0.10)'; c.fillRect(4, 5, W-8, H-10);
        c.strokeStyle = '#68d8f0'; c.lineWidth = 1.6;
        for (const ox of [-4, 0, 4]) {
          c.beginPath(); c.moveTo(W/2+ox-3, H-9); c.lineTo(W/2+ox+3, 8); c.stroke();
        }
        c.fillStyle = '#c8ccc6';
        for (const ox of [-4, 0, 4]) { c.beginPath(); c.arc(W/2+ox-3, H-9, 1.6, 0, Math.PI*2); c.fill(); }
        c.fillStyle = '#40d0ff'; c.fillRect(W-9, 6, 4, 3);
        c.fillStyle = '#40d0ff'; c.fillRect(4, 6, 4, 3);
      } else if (type === T.BATTERY) {
        c.strokeStyle = '#60a030'; c.lineWidth = 1.5; c.strokeRect(4,4,W-8,H-8);
        c.fillStyle='rgba(100,200,40,0.15)'; c.fillRect(5,5,W-10,H-10);
        c.fillStyle='rgba(100,200,40,0.5)'; c.fillRect(5, 5+(H-10)*0.4, W-10, (H-10)*0.6);
        c.fillStyle='#60a030'; c.fillRect(W/2-4,2,8,3);
      } else if (type === T.COMMERCIAL) {
        c.strokeStyle = '#806030'; c.lineWidth = 1.5; c.strokeRect(4,2,W-8,H-4);
        for (let r=0;r<4;r++) for (let ci=0;ci<3;ci++) {
          c.fillStyle='rgba(255,200,60,0.5)'; c.fillRect(7+ci*8,5+r*7,5,4);
        }
      } else if (type === T.MONITOR) {
        c.strokeStyle = '#30c090'; c.lineWidth = 1.5;
        c.strokeRect(3, 3, W-6, H-10);
        c.fillStyle = '#001a12'; c.fillRect(4, 4, W-8, H-12);
        // mini bar graph
        c.fillStyle = 'rgba(0,200,255,0.7)'; c.fillRect(7,  H-16, 5, 8);
        c.fillStyle = 'rgba(255,180,40,0.7)'; c.fillRect(14, H-16, 5, 5);
        // stand
        c.fillStyle = '#30c090';
        c.fillRect(W/2-3, H-7, 6, 3); c.fillRect(W/2-6, H-5, 12, 2);
      } else if (type === T.MONITOR2) {
        // a wide console: two screens, a dish on the roof
        c.strokeStyle = '#30c090'; c.lineWidth = 1.5;
        c.strokeRect(2, 8, W-4, H-14);
        c.fillStyle = '#001a12'; c.fillRect(3, 9, W-6, H-16);
        c.fillStyle = 'rgba(0,200,255,0.75)'; c.fillRect(5, H-14, 3, 6); c.fillRect(9, H-17, 3, 9);
        c.fillStyle = 'rgba(255,180,40,0.75)'; c.fillRect(W-12, H-13, 3, 5); c.fillRect(W-8, H-16, 3, 8);
        c.strokeStyle = '#30c090'; c.beginPath(); c.arc(W/2, 7, 5, Math.PI, 0); c.stroke();
        c.beginPath(); c.moveTo(W/2, 7); c.lineTo(W/2, 2); c.stroke();
        c.fillStyle = '#30c090'; c.fillRect(W/2-7, H-5, 14, 2);
      } else if (type === T.ENGOFFICE) {
        // a drawing board: a plan with a pipe run on it and a fault ringed in red
        c.strokeStyle = '#7ad8ff'; c.lineWidth = 1.5;
        c.strokeRect(3, 4, W-6, H-11);
        c.fillStyle = '#06223a'; c.fillRect(4, 5, W-8, H-13);
        c.strokeStyle = 'rgba(122,216,255,0.9)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(7, H-12); c.lineTo(7, 10); c.lineTo(W/2, 10); c.lineTo(W/2, H-14); c.lineTo(W-8, H-14); c.stroke();
        c.strokeStyle = '#ff5a48'; c.beginPath(); c.arc(W-8, H-14, 3, 0, Math.PI*2); c.stroke();
        c.fillStyle = '#7ad8ff'; c.fillRect(W/2-7, H-5, 14, 2);
      } else if (type === T.BEACON) {
        const mx = W / 2;
        // Tapering lattice mast
        c.strokeStyle = '#54749c'; c.lineWidth = 1.4; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(mx - 7, H - 4); c.lineTo(mx - 2, 9);
        c.moveTo(mx + 7, H - 4); c.lineTo(mx + 2, 9);
        c.stroke();
        c.strokeStyle = 'rgba(84,116,156,0.8)'; c.lineWidth = 0.8;
        c.beginPath();
        for (let i = 0; i < 3; i++) {
          const y0 = H - 4 - i * (H - 13) / 3, y1 = H - 4 - (i + 1) * (H - 13) / 3;
          const h0 = 7 - i * 1.7,             h1 = 7 - (i + 1) * 1.7;
          c.moveTo(mx - h0, y0); c.lineTo(mx + h0, y0);
          c.moveTo(mx - h0, y0); c.lineTo(mx + h1, y1);
          c.moveTo(mx + h0, y0); c.lineTo(mx - h1, y1);
        }
        c.stroke();
        // Dish
        c.save(); c.translate(mx + 5, 10); c.rotate(-0.55);
        c.beginPath(); c.ellipse(0, 0, 2.6, 6, 0, 0, Math.PI * 2);
        c.fillStyle = '#16283f'; c.fill();
        c.strokeStyle = '#6d9ecb'; c.lineWidth = 1; c.stroke();
        c.restore();
        // Transmit arcs + warning lamp
        c.strokeStyle = 'rgba(90,168,255,0.55)'; c.lineWidth = 1;
        c.beginPath(); c.arc(mx, 9, 8,  Math.PI * 1.15, Math.PI * 1.85); c.stroke();
        c.beginPath(); c.arc(mx, 9, 12, Math.PI * 1.2,  Math.PI * 1.8);  c.stroke();
        c.beginPath(); c.arc(mx, 4, 1.6, 0, Math.PI * 2);
        c.fillStyle = '#ff5a5a'; c.fill();
      } else if (type === T.CAMERA) {
        c.strokeStyle = '#5050b0'; c.lineWidth = 1.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(6,H-4); c.lineTo(6,H/2); c.lineTo(12,H/2-3); c.stroke();
        c.strokeRect(12,H/2-6,12,7);
        c.beginPath(); c.arc(24,H/2-3,2.5,0,Math.PI*2); c.fillStyle='#8080ff'; c.fill();
        c.beginPath(); c.arc(14,H/2-8,2,0,Math.PI*2); c.fillStyle='rgba(255,60,60,0.8)'; c.fill();
      } else if (type === T.EVCHARGER) {
        c.strokeStyle = '#30c060'; c.lineWidth = 1.5;
        c.strokeRect(6,3,W-12,H-6);
        c.fillStyle='rgba(64,255,128,0.7)';
        c.beginPath();
        c.moveTo(W/2+2,5); c.lineTo(W/2-3,H/2); c.lineTo(W/2+1,H/2);
        c.lineTo(W/2-3,H-5); c.lineTo(W/2+4,H/2); c.lineTo(W/2,H/2);
        c.closePath(); c.fill();
      } else if (type === T.LAMP) {
        c.strokeStyle = '#806030'; c.lineWidth = 1.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(W/2, H-3); c.lineTo(W/2, 10); c.stroke();
        c.beginPath(); c.moveTo(W/2, 10); c.lineTo(W/2+7, 6); c.stroke();
        c.beginPath(); c.arc(W/2+7, 6, 4, 0, Math.PI*2);
        c.fillStyle = '#ffe090'; c.fill();
      } else if (type === T.POWERTOWER) {
        c.strokeStyle = '#4080c0'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(W/2, H-4); c.lineTo(W/2, 4); c.stroke();
        [[8,0.26],[5,0.5]].forEach(([aw, fy]) => {
          c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(W/2-aw, H*fy); c.lineTo(W/2+aw, H*fy); c.stroke();
          c.lineWidth = 0.7; c.strokeStyle = 'rgba(64,128,192,0.4)';
          c.beginPath(); c.moveTo(W/2-aw, H*fy); c.lineTo(W/2, H*fy+5); c.stroke();
          c.beginPath(); c.moveTo(W/2+aw, H*fy); c.lineTo(W/2, H*fy+5); c.stroke();
          c.strokeStyle = '#4080c0';
          c.beginPath(); c.arc(W/2-aw, H*fy, 1.5, 0, Math.PI*2);
          c.fillStyle = 'rgba(255,200,80,0.8)'; c.fill();
          c.beginPath(); c.arc(W/2+aw, H*fy, 1.5, 0, Math.PI*2); c.fill();
        });
        c.beginPath(); c.arc(W/2, 5, 2, 0, Math.PI*2);
        c.fillStyle = 'rgba(255,80,40,0.8)'; c.fill();
      } else if (type === T.LIGHTNINGROD) {
        // Grounded mast with a bolt striking the tip
        c.strokeStyle = '#8a97a6'; c.lineWidth = 1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(W/2-4, H-4); c.lineTo(W/2-1, 8); c.stroke();
        c.beginPath(); c.moveTo(W/2+4, H-4); c.lineTo(W/2+1, 8); c.stroke();
        c.lineWidth = 0.7; c.strokeStyle = 'rgba(138,151,166,0.7)';
        [0.35, 0.55, 0.75].forEach(fy => {
          const sp = 4 * (1 - (1 - fy) * 0.5);
          c.beginPath(); c.moveTo(W/2-sp, H*fy); c.lineTo(W/2+sp, H*fy); c.stroke();
        });
        // Concrete pad
        c.fillStyle = '#3a3a40'; c.fillRect(W/2-6, H-4, 12, 2.5);
        // Copper spike
        c.strokeStyle = '#c07840'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(W/2, 8); c.lineTo(W/2, 3); c.stroke();
        // Incoming bolt
        c.strokeStyle = '#bfe6ff'; c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(W/2+8, 1); c.lineTo(W/2+3, 4); c.lineTo(W/2+5, 4.5); c.lineTo(W/2+1, 3);
        c.stroke();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(W/2, 3, 1.6, 0, Math.PI*2); c.fill();
      } else if (type === T.LIGHTNINGROD2) {
        // Coil tower — wider stance, toroid, three-spike crown
        c.strokeStyle = '#8a97a6'; c.lineWidth = 1.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(W/2-5, H-4); c.lineTo(W/2-1.5, 10); c.stroke();
        c.beginPath(); c.moveTo(W/2+5, H-4); c.lineTo(W/2+1.5, 10); c.stroke();
        c.lineWidth = 0.7; c.strokeStyle = 'rgba(138,151,166,0.7)';
        [0.45, 0.65, 0.85].forEach(fy => {
          const sp = 5 * (1 - (1 - fy) * 0.55);
          c.beginPath(); c.moveTo(W/2-sp, H*fy); c.lineTo(W/2+sp, H*fy); c.stroke();
        });
        c.fillStyle = '#3a3a40'; c.fillRect(W/2-7, H-4, 14, 2.5);
        // Toroid coil
        c.fillStyle = '#c07840';
        c.beginPath(); c.ellipse(W/2, 9.5, 4.5, 2, 0, 0, Math.PI*2); c.fill();
        c.strokeStyle = '#ffd8a0'; c.lineWidth = 0.7; c.stroke();
        // Crown of three spikes
        c.strokeStyle = '#e0a060'; c.lineWidth = 1.3;
        [[-3.5, 5.5], [0, 2.5], [3.5, 5.5]].forEach(([dx, ty]) => {
          c.beginPath(); c.moveTo(W/2 + dx*0.4, 8); c.lineTo(W/2 + dx, ty); c.stroke();
        });
        // Arc across the crown
        c.strokeStyle = '#bfe6ff'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W/2-3.5, 5.5);
        c.quadraticCurveTo(W/2, 1.5, W/2+3.5, 5.5); c.stroke();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(W/2, 2.5, 1.5, 0, Math.PI*2); c.fill();
      } else if (type === T.LIGHTNINGROD3) {
        // Storm spire — capacitor base, violet plasma column, twin toroids,
        // electrode sphere with a bolt landing on it
        c.fillStyle = '#2a2e38'; c.fillRect(W/2-8, H-5, 16, 3.5);
        c.fillStyle = '#9a7cff';
        for (const dx of [-6, -3, 3, 6]) c.fillRect(W/2 + dx - 0.8, H-8, 1.6, 3);
        c.strokeStyle = '#8a97a6'; c.lineWidth = 1.4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(W/2-6, H-5); c.lineTo(W/2-2, 11); c.stroke();
        c.beginPath(); c.moveTo(W/2+6, H-5); c.lineTo(W/2+2, 11); c.stroke();
        c.strokeStyle = '#c8b0ff'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(W/2, H-6); c.lineTo(W/2, 7); c.stroke();
        c.fillStyle = '#c07840'; c.strokeStyle = '#ffd8a0'; c.lineWidth = 0.6;
        c.beginPath(); c.ellipse(W/2, 14, 5.5, 1.9, 0, 0, Math.PI*2); c.fill(); c.stroke();
        c.beginPath(); c.ellipse(W/2, 9.5, 4, 1.5, 0, 0, Math.PI*2); c.fill(); c.stroke();
        const sg = c.createRadialGradient(W/2-0.8, 4.2, 0.3, W/2, 5, 3);
        sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#8a9ab0');
        c.fillStyle = sg; c.beginPath(); c.arc(W/2, 5, 2.6, 0, Math.PI*2); c.fill();
        c.strokeStyle = '#e8dcff'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(W/2+9, 0); c.lineTo(W/2+4, 2.5); c.lineTo(W/2+6, 3); c.lineTo(W/2+2, 4.5); c.stroke();
      } else if (type === T.CELLTOWER) {
        // Lattice tower icon
        c.strokeStyle = '#40a0ff'; c.lineWidth = 1.5; c.lineCap = 'round';
        // Mast
        c.beginPath(); c.moveTo(W/2, H-3); c.lineTo(W/2, 4); c.stroke();
        // Two cross arms
        [[8, 0.35],[6, 0.55]].forEach(([aw, fy]) => {
          c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(W/2-aw, H*fy); c.lineTo(W/2+aw, H*fy); c.stroke();
          c.lineWidth = 0.8;
          c.strokeStyle = 'rgba(64,160,255,0.5)';
          c.beginPath(); c.moveTo(W/2-aw, H*fy); c.lineTo(W/2, H*fy+5); c.stroke();
          c.beginPath(); c.moveTo(W/2+aw, H*fy); c.lineTo(W/2, H*fy+5); c.stroke();
          c.strokeStyle = '#40a0ff';
        });
        // Beacon
        c.beginPath(); c.arc(W/2, 5, 2, 0, Math.PI*2);
        c.fillStyle = 'rgba(255,80,40,0.8)'; c.fill();
      } else if (type === T.POLE) {
        c.strokeStyle = '#50a050';
        c.lineWidth   = 2;
        c.lineCap     = 'round';
        c.beginPath(); c.moveTo(W/2, H-3); c.lineTo(W/2, 6); c.stroke();
        c.beginPath(); c.moveTo(W/2-8, 10); c.lineTo(W/2+8, 10); c.stroke();
        [[W/2-8,10],[W/2,10],[W/2+8,10]].forEach(([ix,iy]) => {
          c.beginPath(); c.arc(ix,iy,2,0,Math.PI*2);
          c.fillStyle='#50a050'; c.fill();
        });
      } else if (type === T.PROTECTOR) {
        // Box with 3 indicator dots + bolt
        c.strokeStyle = '#40e0ff'; c.lineWidth = 1.5;
        c.strokeRect(4, 4, W-8, H-8);
        [-5,0,5].forEach(ox => {
          c.beginPath(); c.arc(W/2+ox, H/2-3, 2, 0, Math.PI*2);
          c.fillStyle = ox === 0 ? '#40e0ff' : 'rgba(64,224,255,0.4)'; c.fill();
        });
        c.beginPath();
        c.moveTo(W/2+2,H/2+2); c.lineTo(W/2-2,H/2+6); c.lineTo(W/2+1,H/2+6);
        c.lineTo(W/2-2,H/2+10); c.lineTo(W/2+2,H/2+6); c.lineTo(W/2-1,H/2+6);
        c.closePath(); c.fillStyle='#40e0ff'; c.fill();
      } else if (type === T.CARBONCAPTURE) {
        // Fan wall (2×2 fans) with a CO₂ arrow drawn in
        c.strokeStyle = '#5ec8a0'; c.lineWidth = 1.5;
        c.strokeRect(4, 7, W-8, H-12);
        for (const [fx, fy] of [[W*0.33, H*0.38], [W*0.67, H*0.38], [W*0.33, H*0.68], [W*0.67, H*0.68]]) {
          c.beginPath(); c.arc(fx, fy, W*0.12, 0, Math.PI*2); c.strokeStyle = '#a8f0d0'; c.lineWidth = 1; c.stroke();
          for (let k = 0; k < 3; k++) { const a = k*Math.PI*2/3 + 0.4; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + Math.cos(a)*W*0.1, fy + Math.sin(a)*W*0.1); c.stroke(); }
        }
        c.fillStyle = '#70f0b0'; c.font = `bold ${Math.round(W*0.2)}px Arial`; c.textAlign = 'center';
        c.fillText('CO₂', W/2, H*0.2 + 1);
        c.textAlign = 'left';
      } else if (type === T.GOVERNOR) {
        // Cabinet with a flyball governor on top
        c.strokeStyle = '#8a929a'; c.lineWidth = 1.5;
        c.strokeRect(5, 8, W-10, H-11);
        c.strokeStyle = '#c89a40'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(W/2, 5); c.lineTo(W/2-6, 11); c.moveTo(W/2, 5); c.lineTo(W/2+6, 11); c.stroke();
        for (const ox of [-6, 6]) { c.beginPath(); c.arc(W/2+ox, 11, 2.4, 0, Math.PI*2); c.fillStyle = '#e0b048'; c.fill(); }
        c.beginPath(); c.moveTo(W/2, 5); c.lineTo(W/2, H/2+2); c.strokeStyle = '#8a929a'; c.stroke();
        c.beginPath(); c.arc(W-9, H-7, 1.8, 0, Math.PI*2); c.fillStyle = '#40e070'; c.fill();
      } else if (type === T.PROTECTOR2) {
        c.strokeStyle = '#00ffcc'; c.lineWidth = 2;
        c.strokeRect(3, 3, W-6, H-6);
        [-6,-2,2,6].forEach((ox,i) => {
          c.beginPath(); c.arc(W/2+ox, H/2-4, 1.8, 0, Math.PI*2);
          c.fillStyle = i<2?'#00ffcc':'rgba(0,255,200,0.4)'; c.fill();
        });
        for (const sx of [-4,4]) {
          c.beginPath();
          c.moveTo(W/2+sx+2,H/2+1); c.lineTo(W/2+sx-2,H/2+5); c.lineTo(W/2+sx+1,H/2+5);
          c.lineTo(W/2+sx-2,H/2+9); c.lineTo(W/2+sx+2,H/2+5); c.lineTo(W/2+sx-1,H/2+5);
          c.closePath(); c.fillStyle='#00ffcc'; c.fill();
        }
        c.font='bold 6px sans-serif'; c.fillStyle='rgba(0,255,200,0.9)'; c.textAlign='right'; c.fillText('2',W-2,H-1); c.textAlign='left';
      } else if (type === T.PROTECTOR3) {
        // Same family as the MK2 mark so the tier reads at a glance, in the
        // MK3 violet: a heavier double-walled bay, three GIS tanks and a
        // twin bolt.
        c.strokeStyle = '#b070ff'; c.lineWidth = 2;
        c.strokeRect(2, 2, W-4, H-4);
        c.strokeStyle = 'rgba(176,112,255,0.45)'; c.lineWidth = 1;
        c.strokeRect(4.5, 4.5, W-9, H-9);
        for (const ox of [-7, 0, 7]) {
          c.fillStyle = '#d0a8ff';
          c.beginPath(); c.roundRect(W/2+ox-2, H/2-8, 4, 8, 1.6); c.fill();
          c.fillStyle = '#b070ff';
          c.beginPath(); c.ellipse(W/2+ox, H/2-8, 3.2, 1.2, 0, 0, Math.PI*2); c.fill();
        }
        for (const sx of [-5, 5]) {
          c.beginPath();
          c.moveTo(W/2+sx+2,H/2+1); c.lineTo(W/2+sx-2,H/2+5); c.lineTo(W/2+sx+1,H/2+5);
          c.lineTo(W/2+sx-2,H/2+9); c.lineTo(W/2+sx+2,H/2+5); c.lineTo(W/2+sx-1,H/2+5);
          c.closePath(); c.fillStyle='#e0c0ff'; c.fill();
        }
        c.font='bold 6px sans-serif'; c.fillStyle='rgba(200,160,255,0.95)'; c.textAlign='right'; c.fillText('3',W-2,H-1); c.textAlign='left';
      } else if (type === T.RESEARCH) {
        // Dish + beam icon
        c.strokeStyle = '#8040d0';
        c.lineWidth   = 1.5;
        c.beginPath(); c.arc(W/2, H/2+4, 8, Math.PI, 0); c.stroke();
        c.beginPath(); c.moveTo(W/2, H/2+4); c.lineTo(W/2, 6); c.stroke();
        c.beginPath(); c.arc(W/2, 6, 2, 0, Math.PI*2);
        c.fillStyle = '#b060ff'; c.fill();
      } else if (type === T.RESEARCH2) {
        // Two dishes icon for MK2
        c.strokeStyle = '#a050e0';
        c.lineWidth   = 1.5;
        const offs = [-7, 7];
        offs.forEach(ox => {
          c.beginPath(); c.arc(W/2+ox, H/2+5, 6, Math.PI, 0); c.stroke();
          c.beginPath(); c.moveTo(W/2+ox, H/2+5); c.lineTo(W/2+ox, 6); c.stroke();
        });
        c.beginPath(); c.moveTo(W/2-7, 6); c.lineTo(W/2+7, 6); c.stroke();
        c.beginPath(); c.arc(W/2, 6, 2, 0, Math.PI*2);
        c.fillStyle = '#d090ff'; c.fill();
      } else if (type === T.RESEARCH3) {
        // Three dishes icon for MK3
        c.strokeStyle = '#c070f0';
        c.lineWidth   = 1.5;
        const offs3 = [-8, 0, 8];
        offs3.forEach(ox => {
          c.beginPath(); c.arc(W/2+ox, H/2+6, 5, Math.PI, 0); c.stroke();
          c.beginPath(); c.moveTo(W/2+ox, H/2+6); c.lineTo(W/2+ox, 5); c.stroke();
        });
        c.beginPath(); c.moveTo(W/2-8, 5); c.lineTo(W/2+8, 5); c.stroke();
        c.beginPath(); c.arc(W/2, 5, 2, 0, Math.PI*2);
        c.fillStyle = '#e0a0ff'; c.fill();
        c.font='bold 6px sans-serif'; c.fillStyle='rgba(224,160,255,0.9)'; c.textAlign='right'; c.fillText('3',W-2,H-1); c.textAlign='left';
      } else if (type === T.WIRE) {
        c.strokeStyle = '#00d4ff';
        c.lineWidth   = 2;
        c.lineCap     = 'round';
        c.beginPath();
        c.moveTo(4, H / 2); c.lineTo(W - 4, H / 2);
        c.stroke();
        c.beginPath();
        c.moveTo(W / 2, 4); c.lineTo(W / 2, H - 4);
        c.stroke();
        c.beginPath();
        c.arc(W / 2, H / 2, 3, 0, Math.PI * 2);
        c.fillStyle = '#00d4ff';
        c.fill();
      } else if (type === T.__UNUSED_CONSUMER__) {
        c.strokeStyle = '#40ff80';
        c.lineWidth   = 1.5;
        c.beginPath();
        c.roundRect(4, 4, W - 8, H - 8, 2);
        c.stroke();
        c.fillStyle = 'rgba(64,255,128,0.12)';
        c.fill();
        const bw = (W - 12) / 3 - 1;
        for (let i = 0; i < 3; i++) {
          c.fillStyle = 'rgba(64,255,128,0.5)';
          c.fillRect(6 + i * (bw + 1), H / 2 - 2, bw, 4);
        }
      } else if (type === T.SURVEY) {
        // Radar dish
        c.strokeStyle = '#c08030'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(W/2, H/2+4, 9, Math.PI, 0); c.stroke();
        c.beginPath(); c.arc(W/2, H/2+4, 5, Math.PI, 0); c.stroke();
        c.beginPath(); c.moveTo(W/2, H/2+4); c.lineTo(W/2, 5); c.stroke();
        c.beginPath(); c.arc(W/2, 5, 2.5, 0, Math.PI*2);
        c.fillStyle = '#f0a030'; c.fill();
      } else if (type === T.SURVEY2) {
        // Twin dishes on two masts over a control block — "two scans at once"
        c.fillStyle = '#1a1408'; c.fillRect(5, H - 9, W - 10, 6);
        c.strokeStyle = '#ffb040'; c.lineWidth = 1.2;
        c.strokeRect(5, H - 9, W - 10, 6);
        for (const [mx, top, tilt] of [[W * 0.30, 9, -0.35], [W * 0.70, 7, 0.35]]) {
          c.beginPath(); c.moveTo(mx, H - 9); c.lineTo(mx, top + 3); c.stroke();
          c.save(); c.translate(mx, top + 2); c.rotate(tilt);
          c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI); c.stroke();
          c.restore();
          c.beginPath(); c.arc(mx, top, 1.6, 0, Math.PI * 2);
          c.fillStyle = '#ffd070'; c.fill();
        }
        c.fillStyle = '#ffb040'; c.font = 'bold 6px monospace'; c.textAlign = 'center';
        c.fillText('2', W / 2, H - 4.2); c.textAlign = 'left';
      } else if (type === T.COALDEPOSIT) {
        // Rocky chunks
        c.fillStyle = '#403830'; c.fillRect(3,3,W-6,H-6);
        c.fillStyle = '#1a1820';
        [[5,5,8,6],[15,4,9,7],[5,13,10,5],[14,12,8,6]].forEach(([x,y,w2,h2]) => {
          c.beginPath(); c.ellipse(x+w2/2,y+h2/2,w2/2,h2/2,0.3,0,Math.PI*2); c.fill();
        });
      } else if (type === T.COALMINE) {
        // Mine shaft + gear icon
        c.strokeStyle = '#c06020'; c.lineWidth = 1.5;
        c.strokeRect(3,3,W-6,H-6);
        c.fillStyle = '#0e0c08'; c.fillRect(4,4,W-8,H-8);
        // Smokestack
        c.fillStyle = '#302010'; c.fillRect(W/2-3, 5, 6, 10);
        // Smoke puff
        c.fillStyle = 'rgba(80,60,30,0.6)';
        c.beginPath(); c.arc(W/2, 4, 3, 0, Math.PI*2); c.fill();
        // Body slots
        c.fillStyle = 'rgba(255,100,30,0.5)';
        for (let i=0;i<3;i++) c.fillRect(6+i*8, H/2+2, 5, 4);
      } else if (type === T.COALMINE2) {
        // MK2 mine — brighter with MK2 label
        c.fillStyle = '#1a0c06'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#ff8030'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        c.fillStyle = '#302010';
        c.fillRect(W/2-3, 5, 6, 8); c.fillRect(W/2+3, 5, 4, 8);
        c.fillStyle = 'rgba(100,60,20,0.6)';
        c.beginPath(); c.arc(W/2, 4, 3.5, 0, Math.PI*2); c.fill();
        for (let i=0;i<3;i++) c.fillRect(6+i*7, H/2+2, 5, 4);
        c.fillStyle = '#ff8030'; c.font = '6px Courier New'; c.textAlign = 'center';
        c.fillText('MK2', W/2, H-2); c.textAlign = 'left';
        // Belt with arrow
        c.strokeStyle = '#c08030'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(4, H/2); c.lineTo(W-4, H/2); c.stroke();
        c.fillStyle = '#c08030';
        c.beginPath(); c.moveTo(W-4, H/2); c.lineTo(W-10, H/2-4); c.lineTo(W-10, H/2+4); c.closePath(); c.fill();
        // Roller lines
        c.lineWidth = 1;
        [8,W/2,W-8].forEach(x => {
          c.beginPath(); c.moveTo(x, H/2-5); c.lineTo(x, H/2+5); c.stroke();
        });
      } else if (type === T.URANIUMMINE) {
        // Dark base + green border
        c.fillStyle = '#08120c'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#60ff80'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Trefoil radiation symbol
        const tcx = W/2, tcy = H/2;
        c.fillStyle = 'rgba(120,255,140,0.85)';
        c.beginPath(); c.arc(tcx, tcy, 1.8, 0, Math.PI*2); c.fill();
        for (let i = 0; i < 3; i++) {
          c.save();
          c.translate(tcx, tcy);
          c.rotate((i * 2 * Math.PI) / 3 - Math.PI / 2);
          c.beginPath();
          c.arc(0, 0, 6, -Math.PI/2 - 0.45, -Math.PI/2 + 0.45);
          c.lineTo(0, 0);
          c.closePath();
          c.fill();
          c.restore();
        }
        // U-235 label
        c.fillStyle = '#60ff80'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('U-235', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.SULFURMINE || type === T.SULFURMINE2) {
        // Dark base + yellow border (the MK2's brighter, with a corner tag)
        const _mk2 = type === T.SULFURMINE2;
        c.fillStyle = '#120e04'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = _mk2 ? '#fff070' : '#e0d040'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        if (_mk2) { c.fillStyle = '#40d0e0'; c.beginPath(); c.moveTo(W-3,3); c.lineTo(W-11,3); c.lineTo(W-3,11); c.closePath(); c.fill(); }
        // Hexagonal crystal icon
        const scx = W/2, scy = H/2 - 1;
        c.fillStyle = 'rgba(220,200,60,0.85)';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          c.beginPath();
          c.moveTo(scx, scy);
          c.lineTo(scx + Math.cos(a) * 6, scy + Math.sin(a) * 6);
          c.lineTo(scx + Math.cos(a + Math.PI/3) * 6, scy + Math.sin(a + Math.PI/3) * 6);
          c.closePath();
          c.fill();
        }
        // S label
        c.fillStyle = '#e0d040'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('S\u2070', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.GEOWELL) {
        // Dark pad + hot-orange border
        c.fillStyle = '#12100e'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#ff9050'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Wellhead over a borehole, with a stubby output spur to the right
        const gwx = W/2 - 1, gwy = H/2 - 1;
        c.strokeStyle = '#ffb070'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(gwx, gwy); c.lineTo(W-4, gwy); c.stroke();
        c.fillStyle = '#2e2420'; c.strokeStyle = '#c08050'; c.lineWidth = 1;
        c.beginPath(); c.arc(gwx, gwy, 4.5, 0, Math.PI*2); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,150,60,0.9)';
        c.beginPath(); c.arc(gwx, gwy, 1.8, 0, Math.PI*2); c.fill();
        // Steam wisp
        c.strokeStyle = 'rgba(230,225,220,0.7)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(gwx, gwy-6); c.quadraticCurveTo(gwx+3, gwy-9, gwx, gwy-12); c.stroke();
      } else if (type === T.GEOTURBINE) {
        c.fillStyle = '#0e1214'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#ffb070'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Rotor
        const gtx = W/2, gty = H/2 - 1;
        c.strokeStyle = 'rgba(255,200,144,0.9)'; c.lineWidth = 1.4;
        c.beginPath(); c.arc(gtx, gty, 5.5, 0, Math.PI*2); c.stroke();
        for (let i = 0; i < 6; i++) {
          const a = (i/6) * Math.PI * 2;
          c.beginPath();
          c.moveTo(gtx + Math.cos(a)*1.5, gty + Math.sin(a)*1.5);
          c.lineTo(gtx + Math.cos(a)*5,   gty + Math.sin(a)*5);
          c.stroke();
        }
      } else if (type === T.LITHIUMMINE) {
        // Dark base + ice-blue border
        c.fillStyle = '#0c1216'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#a0e0ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Elongated crystal icon
        const lcx = W/2, lcy = H/2 - 1;
        c.fillStyle = 'rgba(230,250,255,0.9)';
        c.beginPath();
        c.moveTo(lcx,     lcy - 6);
        c.lineTo(lcx + 3, lcy - 1.5);
        c.lineTo(lcx + 3, lcy + 3);
        c.lineTo(lcx,     lcy + 6);
        c.lineTo(lcx - 3, lcy + 3);
        c.lineTo(lcx - 3, lcy - 1.5);
        c.closePath();
        c.fill();
        // Li label
        c.fillStyle = '#a0e0ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('Li', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.COOLINGTOWER) {
        c.fillStyle = '#0a1418'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#60c0e0'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Tower silhouette
        c.strokeStyle = '#408ab0'; c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(W*0.2, H-3); c.bezierCurveTo(W*0.35, H*0.55, W*0.35, H*0.35, W*0.3, 3);
        c.moveTo(W*0.8, H-3); c.bezierCurveTo(W*0.65, H*0.55, W*0.65, H*0.35, W*0.7, 3);
        c.stroke();
        c.fillStyle = '#60c0e0'; c.font = '4px Courier New'; c.textAlign = 'center';
        c.fillText('COOL', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.COOLINGTOWER2) {
        // Same silhouette as the MK1 but squatter, frosted and flanked by the
        // two chiller drums — reads as "the big one" at hotbar size.
        c.fillStyle = '#05101a'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#7af0ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        c.fillStyle = 'rgba(122,240,255,0.16)';
        c.fillRect(W*0.24, H*0.18, W*0.52, H*0.52);
        c.strokeStyle = '#7af0ff'; c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(W*0.24, H*0.72); c.bezierCurveTo(W*0.38, H*0.46, W*0.38, H*0.32, W*0.32, H*0.16);
        c.moveTo(W*0.76, H*0.72); c.bezierCurveTo(W*0.62, H*0.46, W*0.62, H*0.32, W*0.68, H*0.16);
        c.stroke();
        // throat + chiller drums
        c.strokeStyle = '#bff4ff'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(W*0.5, H*0.17, W*0.18, H*0.045, 0, 0, Math.PI*2); c.stroke();
        c.fillStyle = '#2a6a88';
        c.fillRect(W*0.10, H*0.40, W*0.10, H*0.30);
        c.fillRect(W*0.80, H*0.40, W*0.10, H*0.30);
        c.fillStyle = '#7af0ff'; c.font = '4px Courier New'; c.textAlign = 'center';
        c.fillText('CRYO', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.NUCLEARREACTOR) {
        c.fillStyle = '#080e08'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#60ff80'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        c.strokeStyle = '#40cc60'; c.lineWidth = 1;
        c.beginPath(); c.arc(W*0.38, H*0.46, W*0.22, 0, Math.PI*2); c.stroke();
        c.fillStyle = 'rgba(80,255,120,0.5)';
        c.beginPath(); c.arc(W*0.38, H*0.46, W*0.18, 0, Math.PI*2); c.fill();
        c.fillStyle = '#60ff80'; c.font = '4px Courier New'; c.textAlign = 'center';
        c.fillText('NUKE', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.STEAMTURBINE2) {
        c.fillStyle = '#0c161c'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#7af5ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Five casings on one shaft, growing towards the LP end
        c.fillStyle = '#7af5ff';
        c.fillRect(W*0.12, H*0.43, W*0.72, H*0.05);
        [[0.14, 0.08], [0.27, 0.11], [0.42, 0.15], [0.58, 0.15], [0.74, 0.12]].forEach(([x, hh]) => {
          c.fillStyle = 'rgba(122,245,255,0.75)'; c.fillRect(W*x, H*(0.455 - hh), W*0.1, H*hh*2);
        });
        c.fillStyle = '#ffd890'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('MK2', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.STEAMTURBINE) {
        c.fillStyle = '#12181c'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#40e0ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Turbine blade circle
        c.strokeStyle = '#40e0ff'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(W*0.36, H*0.46, W*0.2, 0, Math.PI*2); c.stroke();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          c.beginPath();
          c.moveTo(W*0.36, H*0.46);
          c.lineTo(W*0.36 + Math.cos(a) * W*0.18, H*0.46 + Math.sin(a) * W*0.18);
          c.stroke();
        }
        // Generator block
        c.fillStyle = 'rgba(64,224,255,0.35)';
        c.fillRect(W*0.6, H*0.32, W*0.28, H*0.36);
        c.fillStyle = '#40e0ff'; c.font = '4px Courier New'; c.textAlign = 'center';
        c.fillText('STEAM', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.FUELPLANT) {
        c.fillStyle = '#0c100a'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#a0ff60'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        c.fillStyle = 'rgba(140,255,80,0.75)';
        c.beginPath(); c.arc(W/2, H/2, 4, 0, Math.PI*2); c.fill();
        c.fillStyle = '#a0ff60'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('U-ROD', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.CHEMICALPLANT) {
        c.fillStyle = '#0a1018'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#40e0c0'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Reactor vessel icon
        c.fillStyle = 'rgba(60,220,180,0.7)';
        c.beginPath(); c.arc(W/2, H/2, 5, 0, Math.PI*2); c.fill();
        // Pipe stubs
        c.strokeStyle = '#20a090'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(3, H*0.3); c.lineTo(8, H*0.3); c.stroke();
        c.beginPath(); c.moveTo(3, H*0.7); c.lineTo(8, H*0.7); c.stroke();
        c.fillStyle = '#40e0c0'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('H₂SO₄', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.MK4RESEARCH) {
        c.fillStyle = '#160424'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#ff60d0'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        c.save();
        c.translate(W/2, H/2);
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const hx = Math.cos(a) * 5, hy = Math.sin(a) * 5;
          if (i === 0) c.moveTo(hx, hy); else c.lineTo(hx, hy);
        }
        c.closePath();
        c.fillStyle = 'rgba(255,96,208,0.6)'; c.fill();
        c.restore();
        c.fillStyle = '#ff60d0'; c.font = '4px Courier New'; c.textAlign = 'center';
        c.fillText('MK4', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.MK5RESEARCH) {
        c.fillStyle = '#1c0e02'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#ffb43c'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        c.save();
        c.translate(W/2, H/2);
        // Ignition sphere inside its laser cage
        const _g = c.createRadialGradient(0, 0, 0, 0, 0, 5);
        _g.addColorStop(0, '#ffffff'); _g.addColorStop(0.45, '#ffdc90'); _g.addColorStop(1, 'rgba(255,180,60,0.2)');
        c.fillStyle = _g; c.beginPath(); c.arc(0, 0, 5, 0, Math.PI*2); c.fill();
        c.strokeStyle = 'rgba(255,180,60,0.8)'; c.lineWidth = 0.8;
        for (let i = 0; i < 6; i++) {
          const a = i/6*Math.PI*2;
          c.beginPath(); c.moveTo(Math.cos(a)*6.5, Math.sin(a)*6.5); c.lineTo(Math.cos(a)*8.5, Math.sin(a)*8.5); c.stroke();
        }
        c.restore();
        c.fillStyle = '#ffb43c'; c.font = '4px Courier New'; c.textAlign = 'center';
        c.fillText('MK5', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.GASSTORAGE) {
        // Horton sphere on legs, with a glowing equator band
        c.fillStyle = '#10161c'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#80d8ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        const r = W*0.26, cx = W/2, cy = H*0.44;
        c.strokeStyle = '#8a969e'; c.lineWidth = 1.2;
        [-0.8, -0.3, 0.3, 0.8].forEach(k => { c.beginPath(); c.moveTo(cx + k*r, cy); c.lineTo(cx + k*r*1.05, H*0.84); c.stroke(); });
        const g = c.createRadialGradient(cx - r*0.4, cy - r*0.4, 1, cx, cy, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#6a7a86');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI*2); c.fill();
        c.strokeStyle = '#80d8ff'; c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(cx, cy + r*0.05, r, r*0.2, 0, 0, Math.PI); c.stroke();
      } else if (type === T.ELECTROLYZER) {
        c.fillStyle = '#041824'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#40c0ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Vertical cell-stack icon
        c.fillStyle = 'rgba(64,192,255,0.5)';
        c.fillRect(W*0.38, H*0.18, W*0.24, H*0.6);
        c.strokeStyle = '#40c0ff'; c.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          const yy = H*0.18 + (H*0.6) * (i/4);
          c.beginPath(); c.moveTo(W*0.38, yy); c.lineTo(W*0.62, yy); c.stroke();
        }
        c.fillStyle = '#40c0ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('H₂', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.LITHIUMPROCESSPLANT) {
        c.fillStyle = '#10141c'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#c0a0ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Vats icon
        c.fillStyle = 'rgba(192,160,255,0.6)';
        [W*0.28, W*0.5, W*0.72].forEach(vx => {
          c.beginPath(); c.arc(vx, H*0.42, 3.5, 0, Math.PI*2); c.fill();
        });
        c.strokeStyle = '#8060c0'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(4, H*0.72); c.lineTo(W-4, H*0.72); c.stroke();
        c.fillStyle = '#c0a0ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('Li-CPD', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.SPENTFUELPOOL) {
        c.fillStyle = '#0a1620'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#6ec8ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Fuel racks glowing under water.
        c.fillStyle = 'rgba(40,110,170,0.75)'; c.fillRect(5,5,W-10,H-12);
        c.fillStyle = 'rgba(140,215,255,0.85)';
        for (let ry=0; ry<2; ry++) for (let rx=0; rx<3; rx++) c.fillRect(7+rx*4.5, 8+ry*5, 3, 3);
        c.fillStyle = '#6ec8ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('POOL', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.REPROCESSOR) {
        c.fillStyle = '#0d0a12'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#b070ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Three extraction columns, splitting one feed into two products.
        c.strokeStyle = 'rgba(176,112,255,0.8)'; c.lineWidth = 2;
        [W*0.32, W*0.5, W*0.68].forEach(vx => {
          c.beginPath(); c.moveTo(vx, H*0.22); c.lineTo(vx, H*0.60); c.stroke();
        });
        c.fillStyle = '#ff8a30'; c.beginPath(); c.arc(W*0.68, H*0.70, 2.2, 0, Math.PI*2); c.fill();
        c.fillStyle = '#8ad860'; c.beginPath(); c.arc(W*0.32, H*0.70, 2.2, 0, Math.PI*2); c.fill();
        c.fillStyle = '#b070ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('Pu', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.MOXPLANT) {
        c.fillStyle = '#120c08'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#ff9060'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Two feeds blending into one rod.
        c.fillStyle = '#ff8a30'; c.beginPath(); c.arc(W*0.26, H*0.28, 2.2, 0, Math.PI*2); c.fill();
        c.fillStyle = '#8ad860'; c.beginPath(); c.arc(W*0.26, H*0.52, 2.2, 0, Math.PI*2); c.fill();
        c.strokeStyle = 'rgba(255,144,96,0.8)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(W*0.32, H*0.28); c.lineTo(W*0.52, H*0.40); c.stroke();
        c.beginPath(); c.moveTo(W*0.32, H*0.52); c.lineTo(W*0.52, H*0.40); c.stroke();
        c.fillStyle = '#ffc24a'; c.fillRect(W*0.56, H*0.34, W*0.26, H*0.12);
        c.fillStyle = '#ff9060'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('MOX', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.DRONECHARGER) {
        c.fillStyle = '#0a1016'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#7df0a4'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Five pads round a charging mast.
        for (let i = 0; i < 5; i++) {
          const a = (i/5)*Math.PI*2 - Math.PI/2;
          const ax = W/2 + Math.cos(a)*W*0.27, ay = H*0.44 + Math.sin(a)*W*0.27;
          c.strokeStyle = 'rgba(125,240,164,0.55)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(W/2, H*0.44); c.lineTo(ax, ay); c.stroke();
          c.strokeStyle = i === 0 ? '#7df0a4' : '#c47a42'; c.lineWidth = 1.2;
          c.beginPath(); c.arc(ax, ay, 2.6, 0, Math.PI*2); c.stroke();
        }
        c.fillStyle = '#7df0a4';
        c.beginPath(); c.arc(W/2, H*0.44, 2.4, 0, Math.PI*2); c.fill();
        c.font = '4px Courier New'; c.textAlign = 'center';
        c.fillText('CHARGE', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.DRONEPORT) {
        c.fillStyle = '#0a1016'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#5ad8ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // A quadcopter over its pad.
        c.strokeStyle = 'rgba(90,216,255,0.55)'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(W/2, H*0.68, 6, 2.2, 0, 0, Math.PI*2); c.stroke();
        c.strokeStyle = '#7fc8e8'; c.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const a = (i/4)*Math.PI*2 + Math.PI/4;
          const ax = W/2 + Math.cos(a)*4.6, ay = H*0.42 + Math.sin(a)*4.6;
          c.beginPath(); c.moveTo(W/2, H*0.42); c.lineTo(ax, ay); c.stroke();
          c.fillStyle = 'rgba(159,216,255,0.55)';
          c.beginPath(); c.arc(ax, ay, 2, 0, Math.PI*2); c.fill();
        }
        c.fillStyle = '#1b2732';
        c.beginPath(); c.arc(W/2, H*0.42, 2.4, 0, Math.PI*2); c.fill();
        c.fillStyle = '#5ad8ff'; c.font = '4px Courier New'; c.textAlign = 'center';
        c.fillText('DRONE', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.ADVREACTOR) {
        c.fillStyle = '#080f0e'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#40ffd0'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Containment dome over a core, with the trefoil-ish triple lobe.
        c.strokeStyle = 'rgba(64,255,208,0.85)'; c.lineWidth = 1.6;
        c.beginPath(); c.arc(W/2, H*0.50, 6, Math.PI, 0); c.stroke();
        c.fillStyle = 'rgba(64,255,208,0.55)';
        for (let i = 0; i < 3; i++) {
          const a = (i/3)*Math.PI*2 - Math.PI/2;
          c.beginPath(); c.arc(W/2 + Math.cos(a)*2.6, H*0.45 + Math.sin(a)*2.6, 1.8, 0, Math.PI*2); c.fill();
        }
        c.fillStyle = '#40ffd0'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('MOX', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.ATMOSCOLLECTOR) {
        c.fillStyle = '#0a1418'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#a0e0ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Swirling intake icon
        c.strokeStyle = 'rgba(160,224,255,0.7)'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(W/2, H*0.42, 5, 0.2*Math.PI, 1.7*Math.PI); c.stroke();
        c.beginPath(); c.arc(W/2, H*0.42, 3, 0.6*Math.PI, 2.1*Math.PI); c.stroke();
        c.fillStyle = '#a0e0ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('N₂', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.HABERBOSCH) {
        c.fillStyle = '#0c1c10'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#40e070'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Reactor vessel icon
        c.fillStyle = 'rgba(64,220,96,0.5)';
        c.fillRect(W*0.32, H*0.2, W*0.36, H*0.5);
        c.strokeStyle = '#40e070'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W*0.32, H*0.4); c.lineTo(W*0.68, H*0.4); c.stroke();
        c.fillStyle = '#40e070'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('NH₃', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.WASHTOWER) {
        c.fillStyle = '#1c0812'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#ff6eb4'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Tower + droplet icon
        c.fillStyle = 'rgba(255,110,180,0.5)';
        c.fillRect(W*0.42, H*0.16, W*0.16, H*0.56);
        c.beginPath(); c.arc(W/2, H*0.42, 3, 0, Math.PI*2); c.fill();
        c.fillStyle = '#ff6eb4'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('D₂', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.FUSIONFUELPLANT) {
        c.fillStyle = '#04141c'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#70f0ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Plasma cell icon — hexagon core with radiating spokes
        c.strokeStyle = 'rgba(112,240,255,0.8)'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(W/2, H*0.42, 4, 0, Math.PI*2); c.stroke();
        [0, 1, 2, 3].forEach(i => {
          const ang = i * Math.PI / 2;
          c.beginPath();
          c.moveTo(W/2 + Math.cos(ang)*4, H*0.42 + Math.sin(ang)*4);
          c.lineTo(W/2 + Math.cos(ang)*7, H*0.42 + Math.sin(ang)*7);
          c.stroke();
        });
        c.fillStyle = '#70f0ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('D-T', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.TRITIUMBREEDER) {
        c.fillStyle = '#0a1410'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#80ffc0'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Beam line into a glowing target
        c.fillStyle = 'rgba(154,232,255,0.8)'; c.fillRect(W*0.14, H*0.40, W*0.46, 2);
        c.fillStyle = '#80ffc0'; c.beginPath(); c.arc(W*0.7, H*0.42, 3.5, 0, Math.PI*2); c.fill();
        c.strokeStyle = 'rgba(128,255,192,0.5)'; c.lineWidth = 1;
        c.beginPath(); c.arc(W*0.7, H*0.42, 6, 0, Math.PI*2); c.stroke();
        c.fillStyle = '#80ffc0'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('³H', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.HULKINGFUSIONREACTOR) {
        c.fillStyle = '#0a0e18'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#40c0ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Torus ring icon
        c.strokeStyle = 'rgba(64,192,255,0.85)'; c.lineWidth = 3;
        c.beginPath(); c.arc(W/2, H*0.42, 6, 0, Math.PI*2); c.stroke();
        c.fillStyle = '#40c0ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('FUSION', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.ADVFUSIONREACTOR) {
        c.fillStyle = '#0c0816'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#c890ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Five-lobed stellarator band with a gold core
        const _ax = (a) => 6.5 * (1 + 0.12*Math.cos(5*a));
        c.beginPath();
        for (let q = 0; q <= 60; q++) { const a = q*Math.PI*2/60, r = _ax(a); const X = W/2 + Math.cos(a)*r, Y = H*0.42 + Math.sin(a)*r; q ? c.lineTo(X, Y) : c.moveTo(X, Y); }
        c.strokeStyle = 'rgba(200,144,255,0.9)'; c.lineWidth = 3; c.stroke();
        c.strokeStyle = 'rgba(255,216,144,0.9)'; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#c890ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('D-He3', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.MHDRING) {
        c.fillStyle = '#080c14'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#60d0ff'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Linear accelerator coil icon
        c.strokeStyle = 'rgba(96,208,255,0.8)'; c.lineWidth = 1.5;
        [0.32, 0.5, 0.68].forEach(f => {
          c.beginPath(); c.ellipse(W*f, H*0.42, 2.2, 5, 0, 0, Math.PI*2); c.stroke();
        });
        c.fillStyle = '#60d0ff'; c.font = '5px Courier New'; c.textAlign = 'center';
        c.fillText('MHD', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.CONVEYORSPLITTER) {
        // One belt in from the left, forking up and down out of a striped
        // diverter box, the favoured way's arrow brighter. 28-unit grid,
        // scaled like the belt icon below.
        c.save(); c.scale(W / 28, H / 28);
        c.lineCap = 'butt';
        const run = (pts) => {
          c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 9; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x + 0.8, y + 1) : c.moveTo(x + 0.8, y + 1)); c.stroke();
          c.strokeStyle = '#8a5a20'; c.lineWidth = 8;  c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
          c.strokeStyle = '#24190f'; c.lineWidth = 5.6; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
        };
        run([[0, 14], [14, 14]]);
        run([[14, 14], [14, 1]]);
        run([[14, 14], [14, 27]]);
        const tri = (x, y, dir, col) => {
          c.fillStyle = col; c.beginPath();
          c.moveTo(x, y + dir * 2.4); c.lineTo(x - 2.2, y - dir * 0.6); c.lineTo(x + 2.2, y - dir * 0.6); c.closePath(); c.fill();
        };
        tri(14, 3.6, -1, '#ffc060');
        tri(14, 24.4, 1, 'rgba(255,192,96,0.55)');
        c.fillStyle = '#ffc060'; c.beginPath(); c.moveTo(5.6, 11.4); c.lineTo(8.2, 14); c.lineTo(5.6, 16.6); c.closePath(); c.fill();
        c.fillStyle = '#e0b020'; c.beginPath(); c.roundRect(8.6, 8.6, 10.8, 10.8, 2); c.fill();
        c.save(); c.beginPath(); c.roundRect(8.6, 8.6, 10.8, 10.8, 2); c.clip();
        c.strokeStyle = '#1a1c1e'; c.lineWidth = 1.3;
        for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(8.6 + k * 3.4, 8.6); c.lineTo(19.4 + k * 3.4, 19.4); c.stroke(); }
        c.restore();
        c.fillStyle = '#3a3f45'; c.beginPath(); c.roundRect(10.4, 10.4, 7.2, 7.2, 1.4); c.fill();
        c.fillStyle = '#ffd080'; c.beginPath(); c.moveTo(14, 11.2); c.lineTo(16.2, 14); c.lineTo(11.8, 14); c.closePath(); c.fill();
        c.fillRect(13.3, 13.8, 1.4, 3);
        c.restore();
      } else if (type === T.CONVEYOR || type === T.UNDERGNDCONVEYOR) {
        // A length of belt seen from above: amber side rails, dark rubber,
        // chevrons showing the direction of travel and a lump of cargo.
        // The underground one dives into a tunnel hood, its buried run shown
        // dashed beyond it with a down arrow.
        // Authored on a 28-unit grid and scaled to the canvas, so it stays
        // sharp at any icon size (see VECTOR below).
        const ug = type === T.UNDERGNDCONVEYOR;
        c.save(); c.scale(W / 28, H / 28);
        const belt = (x0, x1, r0, r1) => {
          c.save();
          c.beginPath(); c.roundRect(x0, 7.6, x1 - x0, 12.8, [r0, r1, r1, r0]); c.clip();
          c.fillStyle = '#8a5a20'; c.fillRect(x0, 7.6, x1 - x0, 12.8);
          c.fillStyle = '#f0b450'; c.fillRect(x0, 7.6, x1 - x0, 1.3);
          c.fillStyle = '#4a2e10'; c.fillRect(x0, 19.1, x1 - x0, 1.3);
          const g = c.createLinearGradient(0, 9.6, 0, 18.4);
          g.addColorStop(0, '#16100a'); g.addColorStop(0.5, '#34261a'); g.addColorStop(1, '#16100a');
          c.fillStyle = g; c.fillRect(x0, 9.6, x1 - x0, 8.8);
          c.restore();
        };
        const chevron = x => {
          c.strokeStyle = '#ffc060'; c.lineWidth = 1.7; c.lineCap = 'round'; c.lineJoin = 'round';
          c.beginPath(); c.moveTo(x - 1.5, 11.4); c.lineTo(x + 1.5, 14); c.lineTo(x - 1.5, 16.6); c.stroke();
        };
        const hood = x => {
          c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.roundRect(x - 2.4, 5.4, 6, 18.4, 2); c.fill();
          const g = c.createLinearGradient(x - 3, 0, x + 3, 0);
          g.addColorStop(0, '#6a4a22'); g.addColorStop(0.5, '#c88a38'); g.addColorStop(1, '#6a4a22');
          c.fillStyle = g; c.beginPath(); c.roundRect(x - 3, 4.6, 6, 18.8, 2); c.fill();
          c.fillStyle = '#080604'; c.beginPath(); c.roundRect(x - 1.3, 7.6, 2.6, 12.8, 1); c.fill();
          c.strokeStyle = '#ffd080'; c.lineWidth = 0.7; c.beginPath(); c.roundRect(x - 3, 4.6, 6, 18.8, 2); c.stroke();
        };
        if (!ug) {
          c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.roundRect(1.6, 9, 26, 12.8, 2.5); c.fill();
          belt(1, 27, 2.5, 2.5);
          [5.6, 11.4, 23.2].forEach(chevron);
          // cargo: a lump of coal riding the belt
          c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.ellipse(17.8, 14.9, 3.2, 2.8, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#4a5058'; c.beginPath(); c.moveTo(14.4, 14.4); c.lineTo(15.8, 11.4); c.lineTo(18.6, 10.9); c.lineTo(20.4, 13.2); c.lineTo(19.6, 16.4); c.lineTo(16.4, 16.9); c.closePath(); c.fill();
          c.fillStyle = '#9aa2ac'; c.beginPath(); c.moveTo(15.8, 11.4); c.lineTo(18.6, 10.9); c.lineTo(17.4, 13.4); c.closePath(); c.fill();
        } else {
          // buried run, carrying on out of sight
          c.fillStyle = 'rgba(224,160,64,0.16)'; c.fillRect(15, 9.4, 13, 9.2);
          c.strokeStyle = 'rgba(255,192,96,0.85)'; c.lineWidth = 1.1; c.setLineDash([2.2, 1.8]);
          c.beginPath(); c.moveTo(16.4, 9.4); c.lineTo(28, 9.4); c.moveTo(16.4, 18.6); c.lineTo(28, 18.6); c.stroke(); c.setLineDash([]);
          belt(0, 11, 0, 0);
          chevron(3.2); chevron(8);
          hood(13);
          c.fillStyle = '#ffc060';
          c.beginPath(); c.moveTo(19.2, 12.2); c.lineTo(25.2, 12.2); c.lineTo(22.2, 16.4); c.closePath(); c.fill();
        }
        c.restore();
      } else if (type === T.COALGENERATOR) {
        // Boiler + smokestacks
        c.fillStyle = '#1a0c06'; c.fillRect(3,3,W-6,H-6);
        c.strokeStyle = '#ff4010'; c.lineWidth = 1.5; c.strokeRect(3,3,W-6,H-6);
        // Smokestacks
        c.fillStyle = '#2a1208';
        c.fillRect(7, 5, 5, 10); c.fillRect(15, 5, 5, 10);
        // Smoke
        c.fillStyle = 'rgba(100,70,40,0.7)';
        c.beginPath(); c.arc(9,4,3,0,Math.PI*2); c.fill();
        c.beginPath(); c.arc(17,4,3,0,Math.PI*2); c.fill();
        // Boiler drum
        c.fillStyle = '#2a1010'; c.strokeStyle = 'rgba(255,80,20,0.6)'; c.lineWidth=1;
        c.beginPath(); c.ellipse(W/2, H/2+3, 8, 5, 0, 0, Math.PI*2); c.fill(); c.stroke();
      } else if (type === T.PUMPJACK) {
        // Walking beam derrick icon
        c.fillStyle = '#0a0c0a'; c.fillRect(2,2,W-4,H-4);
        c.strokeStyle = '#506040'; c.lineWidth = 1; c.strokeRect(2,2,W-4,H-4);
        // Post
        c.strokeStyle = '#809060'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(W/2, H-5); c.lineTo(W/2, H*0.35); c.stroke();
        // Walking beam
        c.strokeStyle = '#a0b070'; c.lineWidth = 2.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(5, H*0.3); c.lineTo(W-5, H*0.3); c.stroke();
        // Horsehead
        c.fillStyle = '#708060';
        c.beginPath(); c.ellipse(W-6, H*0.3-2, 3, 5, 0, 0, Math.PI*2); c.fill();
        // Counterweight
        c.fillStyle = '#506040';
        c.fillRect(4, H*0.25, 7, 7);
        // Rod
        c.strokeStyle = '#c0d090'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(W/2, H*0.3); c.lineTo(W/2, H-5); c.stroke();
        // Pressure dot
        c.beginPath(); c.arc(W-6, H-6, 2.5, 0, Math.PI*2);
        c.fillStyle = '#60d040'; c.fill();
      } else if (type === T.PUMPJACK2) {
        // Heavier walking-beam derrick in graphite and cyan, tagged MK2
        c.fillStyle = '#0a0e12'; c.fillRect(2,2,W-4,H-4);
        c.strokeStyle = '#2e7482'; c.lineWidth = 1; c.strokeRect(2,2,W-4,H-4);
        // A-frame
        c.strokeStyle = '#6a737e'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(W/2-5, H-5); c.lineTo(W/2, H*0.33); c.lineTo(W/2+5, H-5); c.stroke();
        // Walking beam with cyan stripe
        c.strokeStyle = '#8a929a'; c.lineWidth = 3.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(6, H*0.3); c.lineTo(W-5, H*0.3); c.stroke();
        c.strokeStyle = '#40c8e0'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(7, H*0.3); c.lineTo(W-6, H*0.3); c.stroke();
        // Horsehead with LED edge
        c.fillStyle = '#1e2024';
        c.beginPath(); c.ellipse(5, H*0.3+1, 3.5, 6, 0, 0, Math.PI*2); c.fill();
        c.strokeStyle = '#40c8e0'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(5, H*0.3+1, 3.5, 6, 0, Math.PI*0.6, Math.PI*1.4); c.stroke();
        // Twin counterweights
        c.fillStyle = '#2a2e34';
        c.beginPath(); c.arc(W-7, H*0.62, 5, 0, Math.PI*2); c.fill();
        c.strokeStyle = '#40c8e0'; c.beginPath(); c.arc(W-7, H*0.62, 5, 0, Math.PI*2); c.stroke();
        // Rod
        c.strokeStyle = '#d8e0e4'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(5, H*0.3+7); c.lineTo(5, H-5); c.stroke();
        // MK2 tag
        c.font = 'bold 7px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#40c8e0'; c.fillText('2', W/2, H-8);
      } else if (type === T.SOLIDSTORAGE) {
        // Ribbed ore bin with a coal heap and an inclined feed belt
        c.fillStyle = '#0e0d0a'; c.fillRect(2,2,W-4,H-4);
        c.strokeStyle = '#6a4a22'; c.lineWidth = 1; c.strokeRect(2,2,W-4,H-4);
        // coal heap over the rim
        c.fillStyle = '#1c1c20';
        c.beginPath(); c.moveTo(7, H*0.5); c.quadraticCurveTo(W*0.55, H*0.18, W-6, H*0.5); c.closePath(); c.fill();
        c.fillStyle = '#4a4a54';
        c.beginPath(); c.arc(W*0.5, H*0.36, 1.2, 0, Math.PI*2); c.arc(W*0.65, H*0.42, 1, 0, Math.PI*2); c.fill();
        // ribbed front wall
        c.fillStyle = '#8a5a2e'; c.fillRect(6, H*0.5, W-12, H*0.36);
        c.fillStyle = '#6a4222';
        for (let x = 8; x < W-7; x += 3) c.fillRect(x, H*0.5, 1, H*0.3);
        c.fillStyle = '#d8b020'; c.fillRect(6, H*0.82, W-12, 2);
        c.fillStyle = '#6a737e'; c.fillRect(5, H*0.48, W-10, 1.5);
        // feed belt climbing in from the left
        c.strokeStyle = '#9aa0a8'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(3, H*0.42); c.lineTo(W*0.42, H*0.2); c.stroke();
      } else if (type === T.OILSTORAGE) {
        // Cylindrical tank icon
        c.fillStyle = '#0e0c08'; c.fillRect(2,2,W-4,H-4);
        c.strokeStyle = '#604820'; c.lineWidth = 1; c.strokeRect(2,2,W-4,H-4);
        // Tank body
        c.fillStyle = '#1a1408';
        c.strokeStyle = '#806030'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(5, 6, W-10, H-12, 3); c.fill(); c.stroke();
        // Crude fill (half)
        c.save();
        c.beginPath(); c.roundRect(6, 7, W-12, H-14, 2); c.clip();
        c.fillStyle = 'rgba(180,120,30,0.6)';
        c.fillRect(6, H/2, W-12, H/2-7);
        c.restore();
        // Top cap ellipse
        c.fillStyle = '#252010'; c.strokeStyle = '#605020'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(W/2, 8, (W-12)/2, 4, 0, 0, Math.PI*2); c.fill(); c.stroke();
        // Level gauge line
        c.strokeStyle = '#c09030'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W-5, 9); c.lineTo(W-5, H-8); c.stroke();
        // Gauge fill dot
        c.fillStyle = '#90b040';
        c.beginPath(); c.arc(W-5, H/2, 2, 0, Math.PI*2); c.fill();
      } else if (type === T.REFINERY) {
        // Refinery icon: distillation tower + flare
        c.fillStyle = '#0e0c06'; c.fillRect(2,2,W-4,H-4);
        c.strokeStyle = '#704818'; c.lineWidth = 1; c.strokeRect(2,2,W-4,H-4);
        // Main tower
        c.fillStyle = '#1e1c10'; c.strokeStyle = '#806020'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(W/2-3, 5, 7, H-10, 2); c.fill(); c.stroke();
        // Tower bands
        c.strokeStyle = '#504010'; c.lineWidth = 0.8;
        [0.35, 0.55, 0.75].forEach(f => {
          c.beginPath(); c.moveTo(W/2-3, 5 + (H-15)*f); c.lineTo(W/2+4, 5 + (H-15)*f); c.stroke();
        });
        // Cracking unit (left)
        c.fillStyle = '#181408'; c.strokeStyle = '#604010'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(4, H*0.45, 8, H*0.4, 2); c.fill(); c.stroke();
        // Flare stack (far left) + flame
        c.strokeStyle = '#503810'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(5, H-4); c.lineTo(5, H*0.25); c.stroke();
        c.fillStyle = '#EF9F27';
        c.beginPath(); c.ellipse(5, H*0.2, 3, 4, 0, 0, Math.PI*2); c.fill();
        c.fillStyle = '#FAC775';
        c.beginPath(); c.ellipse(5, H*0.17, 1.5, 2.5, 0, 0, Math.PI*2); c.fill();
      } else if (type === T.FUELGEN) {
        // Background
        c.fillStyle = '#0c0a04'; c.fillRect(2,2,W-4,H-4);
        c.strokeStyle = '#ffa020'; c.lineWidth = 1.5; c.strokeRect(2,2,W-4,H-4);
        // Engine block (centre)
        c.fillStyle = '#1e1a0c'; c.strokeStyle = 'rgba(200,150,40,0.8)'; c.lineWidth=1;
        c.beginPath(); c.roundRect(7, H*0.32, W*0.44, H*0.50, 2); c.fill(); c.stroke();
        // 3 cylinder bumps across the top of the block
        c.fillStyle = '#2a2010'; c.strokeStyle = '#604020'; c.lineWidth=0.8;
        [0.1, 0.27, 0.44].forEach(fx => {
          c.beginPath(); c.roundRect(7 + W*fx, H*0.22, W*0.11, H*0.13, 1); c.fill(); c.stroke();
        });
        // Dual exhaust stacks (top left)
        c.fillStyle = '#181208'; c.strokeStyle = '#402808'; c.lineWidth=1;
        c.fillRect(3, 3, 4, H*0.28); c.fillRect(8, 3, 4, H*0.24);
        // Smoke puffs
        c.fillStyle = 'rgba(80,65,40,0.6)';
        c.beginPath(); c.arc(5, 3, 2.5, 0, Math.PI*2); c.fill();
        c.beginPath(); c.arc(10, 2, 2, 0, Math.PI*2); c.fill();
        // Fan circle (left)
        c.fillStyle = '#0e1209'; c.strokeStyle = '#304828'; c.lineWidth=1;
        c.beginPath(); c.arc(4, H*0.62, 4, 0, Math.PI*2); c.fill(); c.stroke();
        c.strokeStyle = '#406035'; c.lineWidth=0.7;
        for (let b=0;b<4;b++) { const a=b/4*Math.PI*2; c.beginPath(); c.moveTo(4,H*0.62); c.lineTo(4+Math.cos(a)*3,H*0.62+Math.sin(a)*3); c.stroke(); }
        // Control panel (right)
        c.fillStyle = '#0a100a'; c.strokeStyle = '#284020'; c.lineWidth=0.8;
        c.beginPath(); c.roundRect(W-8, H*0.28, 6, H*0.50, 1); c.fill(); c.stroke();
        // Screen glow
        c.fillStyle = 'rgba(40,220,60,0.7)';
        c.fillRect(W-7, H*0.31, 4, H*0.16);
        // LEDs
        c.fillStyle='#20ff20'; c.beginPath(); c.arc(W-5,H*0.58,1.2,0,Math.PI*2); c.fill();
        c.fillStyle='#ffb010'; c.beginPath(); c.arc(W-5,H*0.65,1.2,0,Math.PI*2); c.fill();
        // Fuel barrel bottom-left
        c.fillStyle='#18120a'; c.strokeStyle='#3a2808'; c.lineWidth=0.8;
        c.beginPath(); c.roundRect(3, H*0.82, 7, 10, 1); c.fill(); c.stroke();
        c.fillStyle='rgba(180,110,15,0.7)';
        c.fillRect(4, H*0.88, 5, 4);
      } else if (type === T.GASSTATION) {
        // Canopy roof over a pump island, amber accent to match glowColor
        c.fillStyle = '#100e08'; c.fillRect(2,2,W-4,H-4);
        c.strokeStyle = '#ffc040'; c.lineWidth = 1; c.strokeRect(2,2,W-4,H-4);
        // Support posts
        c.strokeStyle = '#5a4418'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(5, H-4); c.lineTo(5, H*0.35); c.stroke();
        c.beginPath(); c.moveTo(W-5, H-4); c.lineTo(W-5, H*0.35); c.stroke();
        // Canopy roof
        c.fillStyle = '#2a2010'; c.strokeStyle = '#ffc040'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(3, H*0.22, W-6, H*0.16, 2); c.fill(); c.stroke();
        // Pump island
        c.fillStyle = '#1c1608'; c.strokeStyle = '#806020'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(W/2-4, H*0.5, 8, H*0.32, 2); c.fill(); c.stroke();
        // Pump screen glow
        c.fillStyle = 'rgba(255,192,64,0.75)';
        c.fillRect(W/2-2.5, H*0.56, 5, H*0.10);
        // Nozzle hose curl
        c.strokeStyle = '#3a2c10'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W/2+4, H*0.62); c.quadraticCurveTo(W/2+8, H*0.66, W/2+5, H*0.74); c.stroke();
      } else if (type === T.COALWASTE || type === T.OILWASTE || type === T.NUCLEARWASTE) {
        // The three processing facilities share one silhouette — a walled
        // compound with a settling tank and a vent stack — and are told apart
        // by their def's glowColor plus the mark on the tank: ash flakes,
        // a sludge slick, and a radiation trefoil respectively.
        const accent = EntityDefs[type].glowColor;
        c.fillStyle = '#100e0a'; c.fillRect(2, 2, W-4, H-4);
        c.strokeStyle = accent; c.lineWidth = 1; c.strokeRect(2, 2, W-4, H-4);
        // Vent stack, left, with a puff
        c.fillStyle = '#1c1810'; c.strokeStyle = accent; c.lineWidth = 0.8;
        c.beginPath(); c.rect(4, H*0.22, 4, H*0.5); c.fill(); c.stroke();
        c.fillStyle = 'rgba(140,140,140,0.35)';
        c.beginPath(); c.arc(6, H*0.16, 2.4, 0, Math.PI*2); c.fill();
        // Settling tank, right — filled with the facility's own accent
        const tx = W*0.52, ty = H*0.34, tw = W*0.36, th = H*0.42;
        c.fillStyle = '#141208'; c.strokeStyle = accent; c.lineWidth = 1;
        c.beginPath(); c.roundRect(tx, ty, tw, th, 2); c.fill(); c.stroke();
        c.globalAlpha = 0.3; c.fillStyle = accent;
        c.fillRect(tx+1, ty+th*0.42, tw-2, th*0.55-1);
        c.globalAlpha = 1;
        const mx = tx + tw/2, my = ty + th*0.66;
        if (type === T.COALWASTE) {
          // Ash flakes settling out
          c.fillStyle = accent;
          [[-3,-2],[0,1],[3,-1],[-1,3]].forEach(([dx,dy]) => {
            c.beginPath(); c.arc(mx+dx, my+dy, 1, 0, Math.PI*2); c.fill();
          });
        } else if (type === T.OILWASTE) {
          // Sludge slick — a heavy wave across the tank
          c.strokeStyle = accent; c.lineWidth = 1.2;
          c.beginPath();
          c.moveTo(tx+2, my);
          c.quadraticCurveTo(mx, my-3, tx+tw-2, my);
          c.stroke();
        } else {
          // Radiation trefoil
          c.fillStyle = accent;
          for (let b = 0; b < 3; b++) {
            const a0 = -Math.PI/2 + b * (Math.PI*2/3);
            c.beginPath();
            c.moveTo(mx, my);
            c.arc(mx, my, 4, a0 - 0.42, a0 + 0.42);
            c.closePath(); c.fill();
          }
          c.fillStyle = '#141208';
          c.beginPath(); c.arc(mx, my, 1.3, 0, Math.PI*2); c.fill();
        }
      } else if (type === T.WATEREXTRACTOR) {
        c.strokeStyle='#20d4c8'; c.lineWidth=1.5;
        c.strokeRect(4,4,W-8,H-8);
        c.beginPath(); c.moveTo(W/2,8); c.lineTo(W/2,H-4); c.stroke();
        c.beginPath(); c.moveTo(W/2-4,H-8); c.lineTo(W/2,H-2); c.lineTo(W/2+4,H-8);
        c.fillStyle='#20d4c8'; c.fill();
        [0.3,0.55,0.8].forEach(f=>{ c.beginPath(); c.arc(W/2,H*f,2.5,0,Math.PI*2); c.fill(); });
      } else if (type === T.PIPE || type === T.UNDERGNDPIPE) {
        // A run of teal pipe: a shaded tube with bolted flange collars, so it
        // can't be mistaken for the wire's thin cross. The underground one
        // drops into a manhole collar, its buried run shown dashed beyond it
        // with a down arrow. 28-unit grid, scaled (see VECTOR).
        const ug = type === T.UNDERGNDPIPE;
        c.save(); c.scale(W / 28, H / 28);
        const tube = (x0, x1) => {
          c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x0, 10.6, x1 - x0, 9);
          const g = c.createLinearGradient(0, 9.4, 0, 18.6);
          g.addColorStop(0, '#0c5468'); g.addColorStop(0.28, '#5cf0ff'); g.addColorStop(0.5, '#20b4d0'); g.addColorStop(1, '#083848');
          c.fillStyle = g; c.fillRect(x0, 9.4, x1 - x0, 9.2);
          c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x0, 11.3, x1 - x0, 0.9);
        };
        const flange = x => {
          const g = c.createLinearGradient(0, 6.4, 0, 21.6);
          g.addColorStop(0, '#1a7890'); g.addColorStop(0.3, '#a0f8ff'); g.addColorStop(0.55, '#30c0dc'); g.addColorStop(1, '#0a4458');
          c.fillStyle = g; c.beginPath(); c.roundRect(x - 1.8, 6.4, 3.6, 15.2, 1); c.fill();
          c.strokeStyle = '#04222c'; c.lineWidth = 0.6; c.stroke();
          c.fillStyle = '#04222c';
          for (const y of [8, 20]) { c.beginPath(); c.arc(x, y, 0.75, 0, Math.PI * 2); c.fill(); }
        };
        const collar = x => {
          c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(x + 0.6, 14.8, 4.4, 8.6, 0, 0, Math.PI * 2); c.fill();
          const g = c.createLinearGradient(x - 4, 0, x + 4, 0);
          g.addColorStop(0, '#0e5a70'); g.addColorStop(0.5, '#58e4f8'); g.addColorStop(1, '#0e5a70');
          c.fillStyle = g; c.beginPath(); c.ellipse(x, 14, 4.2, 8.6, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#03090c'; c.beginPath(); c.ellipse(x, 14, 2.3, 5.6, 0, 0, Math.PI * 2); c.fill();
          c.strokeStyle = '#b0f8ff'; c.lineWidth = 0.6; c.beginPath(); c.ellipse(x, 14, 4.2, 8.6, 0, 0, Math.PI * 2); c.stroke();
        };
        if (!ug) {
          tube(0, 28);
          flange(7); flange(21);
          // flow arrow on the middle section
          c.strokeStyle = '#04303c'; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round';
          c.beginPath(); c.moveTo(12.6, 12.2); c.lineTo(15.4, 14.6); c.lineTo(12.6, 17); c.stroke();
        } else {
          c.fillStyle = 'rgba(32,192,224,0.16)'; c.fillRect(15, 9.6, 13, 8.8);
          c.strokeStyle = 'rgba(96,232,255,0.85)'; c.lineWidth = 1.1; c.setLineDash([2.2, 1.8]);
          c.beginPath(); c.moveTo(17, 9.6); c.lineTo(28, 9.6); c.moveTo(17, 18.4); c.lineTo(28, 18.4); c.stroke(); c.setLineDash([]);
          tube(0, 12);
          flange(4.4);
          collar(13);
          c.fillStyle = '#60e8ff';
          c.beginPath(); c.moveTo(19.6, 12.2); c.lineTo(25.6, 12.2); c.lineTo(22.6, 16.4); c.closePath(); c.fill();
        }
        c.restore();
      } else if (type === T.HYDROGENERATOR) {
        c.strokeStyle='#20d4ff'; c.lineWidth=1.5;
        c.strokeRect(3,3,W-6,H-6);
        for(let i=0;i<5;i++){
          const a=(i/5)*Math.PI*2;
          c.beginPath(); c.moveTo(W/2,H/2);
          c.lineTo(W/2+Math.cos(a)*9,H/2+Math.sin(a)*9);
          c.stroke();
        }
        c.fillStyle='#20d4ff'; c.font='bold 10px monospace'; c.textAlign='center';
        c.fillText('⚡',W/2,H/2+4); c.textAlign='left';
      } else if (type === T.BIOFUELGEN) {
        // Leaf icon with fuel gauge
        c.strokeStyle = '#50c030'; c.lineWidth = 1.5;
        c.strokeRect(3, 3, W-6, H-6);
        // Leaf shape
        c.beginPath();
        c.moveTo(W/2+1, H-6);
        c.quadraticCurveTo(W/2+8, H/2, W/2+1, 5);
        c.quadraticCurveTo(W/2-6, H/2, W/2+1, H-6);
        c.fillStyle = 'rgba(60,200,30,0.4)'; c.fill(); c.stroke();
        // Vein
        c.beginPath(); c.moveTo(W/2+1, H-7); c.lineTo(W/2+1, 6); c.stroke();
        c.beginPath(); c.moveTo(W/2+1, H/2+2); c.lineTo(W/2+5, H/2-1); c.stroke();
        c.beginPath(); c.moveTo(W/2+1, H/2-3); c.lineTo(W/2+5, H/2-6); c.stroke();
      } else if (type === T.POWERTOWER) {
        // Two parallel lines with longer span
        c.strokeStyle = '#40c0ff'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(3, H/2-3); c.lineTo(W-3, H/2-3); c.stroke();
        c.beginPath(); c.moveTo(3, H/2+3); c.lineTo(W-3, H/2+3); c.stroke();
        c.fillStyle = '#40c0ff'; c.font = '6px Courier New'; c.textAlign = 'center';
        c.fillText('MK2', W/2, H-2); c.textAlign = 'left';
      } else if (type === T.DAM) {
        // Concrete dam slab with water held back on top half
        // Water above (held back)
        c.fillStyle = 'rgba(30,120,200,0.55)';
        c.fillRect(3, 3, W-6, H/2 - 2);
        // Wavy water surface
        c.strokeStyle = 'rgba(160,220,255,0.8)';
        c.lineWidth = 1;
        c.beginPath();
        for (let x = 3; x <= W-3; x += 2) {
          const wy = 5 + Math.sin(x * 0.8) * 0.8;
          if (x === 3) c.moveTo(x, wy); else c.lineTo(x, wy);
        }
        c.stroke();
        // Dam wall (horizontal band)
        const dy = H/2;
        const grad = c.createLinearGradient(0, dy-2, 0, dy+6);
        grad.addColorStop(0, '#7a7e86'); grad.addColorStop(1, '#3a3e46');
        c.fillStyle = grad;
        c.fillRect(3, dy-1, W-6, 7);
        c.strokeStyle = '#1a1c20'; c.lineWidth = 1;
        c.strokeRect(3, dy-1, W-6, 7);
        // Buttress ticks
        c.strokeStyle = 'rgba(20,22,26,0.7)';
        for (let i = 1; i < 5; i++) {
          const tx = 3 + (W-6) * i / 5;
          c.beginPath(); c.moveTo(tx, dy); c.lineTo(tx, dy+5); c.stroke();
        }
        // Spillway notch in middle
        c.fillStyle = 'rgba(40,140,200,0.6)';
        c.fillRect(W/2 - 2, dy+5, 4, 2);
        // Outlet below
        c.fillStyle = 'rgba(20,60,90,0.6)';
        c.fillRect(3, H-8, W-6, H-3 - (H-8));
      } else if (type === T.HYDROTURBINE) {
        // Submerged turbine with rotating blades + glowing brass output port
        c.fillStyle = 'rgba(20,50,80,0.7)';
        c.fillRect(3, 3, W-6, H-6);
        // Outer wheel housing
        c.strokeStyle = '#30d4ff'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(W/2 - 3, H/2, H/2 - 5, 0, Math.PI*2); c.stroke();
        // Inner blades (static for icon)
        const cxi = W/2 - 3, cyi = H/2;
        const wri = H/2 - 6;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          c.beginPath();
          c.moveTo(cxi, cyi);
          c.lineTo(cxi + Math.cos(a) * wri, cyi + Math.sin(a) * wri);
          c.lineTo(cxi + Math.cos(a + 0.3) * wri * 0.7, cyi + Math.sin(a + 0.3) * wri * 0.7);
          c.closePath();
          c.fillStyle = 'rgba(48,180,240,0.75)';
          c.fill();
        }
        // Hub
        c.fillStyle = '#a0f0ff'; c.beginPath(); c.arc(cxi, cyi, 2, 0, Math.PI*2); c.fill();
        // Brass output port (right side)
        c.fillStyle = '#ffc040';
        c.beginPath(); c.arc(W - 5, H/2, 2.5, 0, Math.PI*2); c.fill();
        c.strokeStyle = '#1a0e00'; c.lineWidth = 0.8;
        c.beginPath(); c.arc(W - 5, H/2, 2.5, 0, Math.PI*2); c.stroke();
        // Glow
        const gport = c.createRadialGradient(W-5, H/2, 0, W-5, H/2, 5);
        gport.addColorStop(0, 'rgba(255,200,80,0.5)');
        gport.addColorStop(1, 'transparent');
        c.fillStyle = gport;
        c.beginPath(); c.arc(W-5, H/2, 5, 0, Math.PI*2); c.fill();
      } else if (type === T.SHAFT) {
        // Horizontal brass shaft with bearing mounts and glowing ends
        // Mount platform
        c.fillStyle = '#1a1410';
        c.fillRect(2, H/2 - 5, W-4, 10);
        c.strokeStyle = '#0a0804'; c.lineWidth = 0.5;
        c.strokeRect(2, H/2 - 5, W-4, 10);
        // Three bearing mounts (small dark blocks)
        c.fillStyle = '#2a1e10';
        for (let i = 0; i < 3; i++) {
          const bx = 4 + (W - 8) * i / 2;
          c.fillRect(bx - 2, H/2 - 4, 4, 8);
        }
        // Brass shaft
        c.fillStyle = '#e0a020';
        c.fillRect(4, H/2 - 2, W-8, 4);
        // Highlight stripe
        c.fillStyle = 'rgba(255,220,120,0.7)';
        c.fillRect(4, H/2 - 1, W-8, 1);
        // Glowing brass hub end caps
        for (const ex of [4, W-4]) {
          const gend = c.createRadialGradient(ex, H/2, 0, ex, H/2, 4);
          gend.addColorStop(0, 'rgba(255,200,80,0.7)');
          gend.addColorStop(1, 'transparent');
          c.fillStyle = gend;
          c.beginPath(); c.arc(ex, H/2, 4, 0, Math.PI*2); c.fill();
          c.fillStyle = '#ffc040';
          c.beginPath(); c.arc(ex, H/2, 1.8, 0, Math.PI*2); c.fill();
        }
      } else if (type === T.FIBERHUB) {
        // Fiber hub icon — central node box with radiating fiber lines
        // to small pulse nodes. Violet, distinct from Cell Tower's blue mast.
        const cx = W/2, cy = H/2;
        c.strokeStyle = '#a050e0';
        c.lineWidth   = 1;
        const angles = [-2.3, -0.8, 0.8, 2.3];
        angles.forEach(a => {
          const nx = cx + Math.cos(a) * 11;
          const ny = cy + Math.sin(a) * 9;
          c.beginPath(); c.moveTo(cx, cy); c.lineTo(nx, ny); c.stroke();
          c.beginPath(); c.arc(nx, ny, 1.6, 0, Math.PI*2);
          c.fillStyle = 'rgba(200,120,255,0.75)'; c.fill();
        });
        // Central hub box
        c.fillStyle = '#241030';
        c.fillRect(cx-4, cy-4, 8, 8);
        c.strokeStyle = '#c060ff'; c.lineWidth = 1.2;
        c.strokeRect(cx-4, cy-4, 8, 8);
        // Glow + core pulse
        const ghub = c.createRadialGradient(cx, cy, 0, cx, cy, 6);
        ghub.addColorStop(0, 'rgba(200,100,255,0.6)');
        ghub.addColorStop(1, 'transparent');
        c.fillStyle = ghub;
        c.beginPath(); c.arc(cx, cy, 6, 0, Math.PI*2); c.fill();
        c.fillStyle = '#e0b0ff';
        c.beginPath(); c.arc(cx, cy, 1.6, 0, Math.PI*2); c.fill();
      } else if (type === T.FISHINGPOLE) {
        // Fishing pole icon — diagonal rod, taut line, red-white bobber
        c.strokeStyle = '#8a5a28'; c.lineWidth = 1.8; c.lineCap = 'round';
        c.beginPath(); c.moveTo(4, H-4); c.lineTo(W-5, 4); c.stroke();
        c.strokeStyle = 'rgba(210,230,255,0.65)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W-5, 4); c.lineTo(W/2-1, H-6); c.stroke();
        c.beginPath(); c.arc(W/2-1, H-6, 2.2, 0, Math.PI, false);
        c.fillStyle = '#ff5040'; c.fill();
        c.beginPath(); c.arc(W/2-1, H-6, 2.2, Math.PI, Math.PI*2, false);
        c.fillStyle = '#f0f0f0'; c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.6;
        c.beginPath(); c.arc(W/2-1, H-6, 2.2, 0, Math.PI*2); c.stroke();
      } else if (type === 'delete') {
        // Trash / X symbol
        c.strokeStyle = '#ff4444';
        c.lineWidth   = 2.5;
        c.lineCap     = 'round';
        c.beginPath();
        c.moveTo(7, 7); c.lineTo(W-7, H-7);
        c.moveTo(W-7, 7); c.lineTo(7, H-7);
        c.stroke();
      } else if (type === 'zone-delete') {
        // Rubber-band select-delete — dashed red marquee square, filled
        // faintly, distinct from the plain X used by single-tile delete.
        c.fillStyle   = 'rgba(255,68,68,0.18)';
        c.fillRect(6, 6, W-12, H-12);
        c.strokeStyle = '#ff4444';
        c.lineWidth   = 2;
        c.setLineDash([3, 2]);
        c.strokeRect(6, 6, W-12, H-12);
        c.setLineDash([]);
      } else if (type === 'select') {
        // Select tool — a dashed cyan marquee with a pointer dragging its
        // corner out, in the select overlay's colour.
        c.save(); c.scale(W / 28, H / 28);
        c.fillStyle   = 'rgba(96,216,255,0.16)';
        c.fillRect(4, 4, 15, 13);
        c.strokeStyle = '#60d8ff';
        c.lineWidth   = 1.6;
        c.setLineDash([2.5, 1.8]);
        c.strokeRect(4, 4, 15, 13);
        c.setLineDash([]);
        c.beginPath();
        c.moveTo(15, 13); c.lineTo(15, 25); c.lineTo(18, 22); c.lineTo(20.5, 26.5);
        c.lineTo(22.5, 25.5); c.lineTo(20, 21); c.lineTo(24, 21); c.closePath();
        c.fillStyle = '#e8f6ff'; c.fill();
        c.strokeStyle = '#0c2430'; c.lineWidth = 1; c.lineJoin = 'round'; c.stroke();
        c.restore();
      } else if (type === 'copy') {
        // Two overlapping sheets, in the blueprint blue. 28-unit grid, scaled.
        c.save(); c.scale(W / 28, H / 28);
        c.lineWidth = 2; c.lineJoin = 'round';
        c.strokeStyle = '#2a80b0';
        c.beginPath(); c.roundRect(5, 4, 12, 15, 2); c.stroke();
        c.fillStyle = '#0c2430'; c.strokeStyle = '#40c0ff';
        c.beginPath(); c.roundRect(11, 9, 12, 15, 2); c.fill(); c.stroke();
        c.lineWidth = 1.4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(14, 14); c.lineTo(20, 14); c.moveTo(14, 17.5); c.lineTo(20, 17.5); c.moveTo(14, 21); c.lineTo(18, 21); c.stroke();
        c.restore();
      } else if (type === 'undo' || type === 'redo') {
        // Curved arrow — anticlockwise for undo, mirrored for redo.
        c.save();
        if (type === 'redo') { c.translate(W, 0); c.scale(-1, 1); }
        const cx = W / 2, cy = H / 2 + 2, r = Math.min(W, H) * 0.26, a0 = Math.PI * 1.15;
        c.strokeStyle = '#a0c8e0'; c.fillStyle = '#a0c8e0';
        c.lineWidth = 2.5; c.lineCap = 'round';
        c.beginPath(); c.arc(cx, cy, r, a0, Math.PI * 0.3); c.stroke();
        // Arrowhead at the arc's start, pointing back along the tangent
        const sx = cx + r * Math.cos(a0), sy = cy + r * Math.sin(a0);
        const tx = Math.sin(a0), ty = -Math.cos(a0);
        const hl = r * 0.75, hw = r * 0.55;
        c.beginPath();
        c.moveTo(sx + tx * hl, sy + ty * hl);
        c.lineTo(sx - ty * hw, sy + tx * hw);
        c.lineTo(sx + ty * hw, sy - tx * hw);
        c.closePath(); c.fill();
        c.restore();
      }
    };

/* ── Sprite thumbnails ──────────────────────────────────────────────────
   Build/hotbar icons used to be separate hand-drawn mini vectors, so every
   sprite redesign left its icon behind. Now each placeable type's icon is a
   thumbnail of its real map sprite: the entity is rendered once, by the same
   renderEntityAt the map uses, into an offscreen canvas and cached. So an
   icon always matches the building, including future redesigns.

   The shared `ctx` (render_core.js) is pointed at the offscreen canvas for
   the duration, and the clock is pinned to a clear 13:00 with full detail so
   every thumbnail shows its building open, lit and busy. Types that only
   make sense in context (wires, pipes, conveyors, roads) and pure tools keep
   their hand-drawn icons, as does anything that fails to render or comes
   out blank. */
(() => {
  const legacy = RenderSystem.renderIcon;
  const SKIP = new Set([T.WIRE, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.UNDERGNDCONVEYOR, T.CONVEYORSPLITTER, T.ROAD, T.BRIDGE, T.PATHTOOL, T.BLUEPRINT,
    T.FASTTRAVEL, T.COALSCAN, T.OILSCAN, T.URANIUMSCAN, T.SULFURSCAN, T.LITHIUMSCAN, T.HELIUMSCAN, T.RAREEARTHSCAN, T.FISHINGPOLE,
    T.WATER, 'delete', 'zone-delete', 'select', 'undo', 'redo']);
  // Hand-drawn icons that scale themselves to their canvas: drawn at the
  // requested size rather than at 28px and blown up.
  const VECTOR = new Set([T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.UNDERGNDCONVEYOR, T.CONVEYORSPLITTER, 'copy', 'select']);
  const SIZE = 112;                       // cached resolution; icons are drawn at 38–64px
  const cache = new Map();

  function build(type) {
    if (SKIP.has(type) || !EntityDefs[type] || typeof renderEntityAt !== 'function') return null;
    const off = document.createElement('canvas');
    off.width = off.height = SIZE;
    const e = new Entity(type, 0, 0);
    e.def = { ...EntityDefs[type] };
    e.powered = true; e.reliability = 100; e.satisfaction = 80; e._iconThumb = true;
    // Output-driven generators (solar panels glow with what they produce)
    // show as running at their peak rather than dark.
    if (e.def.peakOutput > 0) e.def.powerOutput = e.def.peakOutput;
    // Storage shows charged rather than as an empty dark shell.
    if (e.def.capacity > 0) e.charge = e.def.capacity * 0.8;
    const w = e.width * TILE, h = e.height * TILE;
    const k = Math.min((SIZE - 4) / w, (SIZE - 4) / h);
    const savedCtx = ctx, savedHour = DayNight.hour, savedDark = DayNight.darkness, savedZoom = Camera.zoom;
    try {
      ctx = off.getContext('2d');
      DayNight.hour = () => 13;
      DayNight.darkness = () => 0;
      Camera.zoom = 1;
      ctx.translate((SIZE - w * k) / 2, (SIZE - h * k) / 2);
      ctx.scale(k, k);
      renderEntityAt(e, 0, 0, 12.5);
    } catch (err) {
      return null;
    } finally {
      ctx = savedCtx;
      DayNight.hour = savedHour; DayNight.darkness = savedDark; Camera.zoom = savedZoom;
    }
    // Blank or near-blank result → fall back to the hand-drawn icon
    const d = off.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    let alpha = 0, x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const a = d[(y * SIZE + x) * 4 + 3];
      alpha += a;
      if (a > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (alpha < SIZE * SIZE * 255 * 0.03 || x1 < 0) return null;
    // Crop to what was actually drawn and centre it in a square, so small
    // or thin sprites fill their icon instead of floating in empty footprint.
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, side = Math.max(cw, ch) + 4;
    const out = document.createElement('canvas');
    out.width = out.height = side;
    out.getContext('2d').drawImage(off, x0, y0, cw, ch, (side - cw) / 2, (side - ch) / 2, cw, ch);
    return out;
  }
  function thumb(type) {
    if (!cache.has(type)) cache.set(type, build(type));
    return cache.get(type);
  }

  RenderSystem.renderIcon = function (canvas, type) {
    const th = thumb(type);
    if (!th) return legacy.call(this, canvas, type);
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(th, 0, 0, canvas.width, canvas.height);
  };

  // Draw an icon straight into a destination context at `size` px. Hand-drawn
  // icons are authored for a 28px canvas, so those still go through one and
  // get scaled up; thumbnails come down from their cached resolution instead.
  RenderSystem.drawIconInto = function (c2d, type, size) {
    c2d.clearRect(0, 0, size, size);
    const th = thumb(type);
    if (th) {
      c2d.imageSmoothingEnabled = true; c2d.imageSmoothingQuality = 'high';
      c2d.drawImage(th, 0, 0, size, size);
      return;
    }
    const o = document.createElement('canvas');
    o.width = o.height = VECTOR.has(type) ? size : 28;
    legacy.call(RenderSystem, o, type);
    c2d.drawImage(o, 0, 0, size, size);
  };

  // Sprites can change at runtime (dev reloads, footprint migrations)
  RenderSystem.clearIconCache = () => { cache.clear(); _forget(); };

  // ── Carried over the reload into a game ──
  // Starting or loading a game reloads the page, which used to throw every
  // thumbnail away and build them all again in the first seconds of play:
  // about 1.7 s of drawing in all, up to 160 ms for the biggest plants, in
  // the middle of the game's opening frames. The main menu builds them
  // (the player is usually there a while), and they are kept in IndexedDB
  // for the page after the reload to take up, encoded and decoded off the
  // main thread. They are tied to this window's session (sessionStorage),
  // so a fresh launch always builds its own and an update never shows old
  // icons.
  const DB = 'gw-icon-thumbs', TOKEN_KEY = 'gw_icon_session';
  let token = null;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) { token = Date.now().toString(36) + Math.random().toString(36).slice(2); sessionStorage.setItem(TOKEN_KEY, token); }
  } catch (_e) {}
  let built = 0, stored = 0;              // thumbnails this page drew itself, and how many of them are kept
  const blobs = new Map();                // type -> encoded thumbnail (null: none), each encoded once
  const _open = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('t')) r.result.createObjectStore('t'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const _tx = (db, mode, fn) => new Promise((res, rej) => {
    const t = db.transaction('t', mode); const out = fn(t.objectStore('t'));
    t.oncomplete = () => { db.close(); res(out && out.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  });
  async function _restore() {
    if (!token || typeof indexedDB === 'undefined') return;
    const rec = await _tx(await _open(), 'readonly', st => st.get('thumbs'));
    if (!rec || rec.token !== token) return;
    await Promise.all(Object.entries(rec.items).map(async ([type, blob]) => {
      if (cache.has(type)) return;
      const img = blob ? await createImageBitmap(blob) : null;
      if (!cache.has(type)) { cache.set(type, img); blobs.set(type, blob); }
    }));
  }
  // Kept a batch at a time, so a player who leaves the menu early still
  // takes most of them into the game.
  let storing = false;
  async function _store() {
    if (!token || storing || built === stored || typeof indexedDB === 'undefined') return;
    storing = true;
    try {
      const n = built;
      await Promise.all([...cache].filter(([type]) => !blobs.has(type)).map(([type, th]) => !th ? blobs.set(type, null)
        : th instanceof HTMLCanvasElement ? new Promise(res => th.toBlob(b => { blobs.set(type, b); res(); }, 'image/png')) : null));
      const items = {};
      for (const [type, b] of blobs) items[type] = b;
      await _tx(await _open(), 'readwrite', st => st.put({ token, items }, 'thumbs'));
      stored = n;
    } finally { storing = false; }
    if (built !== stored) _store().catch(() => {});   // built more while that was being written
  }
  function _forget() {
    if (typeof indexedDB === 'undefined') return;
    _open().then(db => _tx(db, 'readwrite', st => st.delete('thumbs'))).catch(() => {});
  }

  // Each thumbnail costs a full sprite render (~30ms for the big ones), so
  // build them in idle time after load instead of stalling the first time a
  // hotbar category opens: those not carried over from the page before.
  const idle = window.requestIdleCallback || (fn => setTimeout(() => fn({ timeRemaining: () => 8 }), 50));
  const queue = Object.values(T).filter(v => EntityDefs[v] && !SKIP.has(v));
  const pump = deadline => {
    while (queue.length && deadline.timeRemaining() > 6) { const type = queue.shift(); if (!cache.has(type)) { thumb(type); built++; } }
    if (!queue.length || built - stored >= 25) _store().catch(() => {});
    if (queue.length) idle(pump);
  };
  window.addEventListener('load', () => {
    _restore().catch(() => {}).then(() => setTimeout(() => idle(pump), 1500));
  });
})();
