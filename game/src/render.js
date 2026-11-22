// All drawing. A static pass (floor, walls, crates, fixtures) is baked once to an offscreen
// canvas; the dynamic pass paints light, vision cones, actors, the vignette and the HUD every
// frame. Screens: title, play, paused, caught, win.
import {
  COLORS, CRATE, EXIT, EXIT_AT, FLOOR, GUARD, PLAYER, ROWS, COLS, TERMINAL, TERMINAL_AT,
  TILE, VIEW_H, VIEW_W, WALL, ZONE_DARK, ZONE_LIT,
} from './config.js';
import { tileAt } from './world.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_CAUGHT = 3;
export const SCREEN_WIN = 4;

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const STATUS = {
  hidden: ['HIDDEN', '#4be3a4'],
  suspicious: ['SUSPICIOUS', '#ffd66e'],
  alert: ['ALERT', '#ff5c4a'],
};

export function createRenderer(canvas, world) {
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d');
  const baked = bakeFloor();

  function draw(state, screen, extras) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.drawImage(baked, 0, 0);
    drawGlows(state);
    drawRings(state);
    for (const g of world.guards) drawCone(state, g);
    for (const g of world.guards) drawGuard(state, g);
    drawPlayer(state, screen);
    drawVignette(state, screen);
    if (screen !== SCREEN_TITLE) drawHud(state, extras);
    if (screen === SCREEN_TITLE) drawTitle(state);
    if (screen === SCREEN_PLAY && state.messageTimer > 0) drawToast(state);
    if (screen === SCREEN_PAUSED) drawCenterPanel('PAUSED', 'P TO RESUME', '#cfd8ea');
    if (screen === SCREEN_CAUGHT) drawCaught(state);
    if (screen === SCREEN_WIN) drawWin(state);
  }

  // ---------- static layer ----------

  function bakeFloor() {
    const off = document.createElement('canvas');
    off.width = VIEW_W;
    off.height = VIEW_H;
    const g = off.getContext('2d');
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    let seed = 9;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const i = y * COLS + x;
        const tile = world.grid[i];
        const zone = world.zones[i];
        const px = x * TILE, py = y * TILE;
        let base = (x + y) % 2 === 0 ? COLORS.floorA : COLORS.floorB;
        if (zone === ZONE_DARK) base = COLORS.floorDark;
        if (zone === ZONE_LIT) base = COLORS.floorLit;
        g.fillStyle = base;
        g.fillRect(px, py, TILE, TILE);
        g.globalAlpha = 0.05;
        for (let s = 0; s < 5; s += 1) {
          g.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
          g.fillRect(px + rand() * TILE, py + rand() * TILE, 2, 2);
        }
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(148,170,214,0.05)';
        g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);

        if (tile === WALL) {
          g.fillStyle = COLORS.wall;
          g.fillRect(px, py, TILE, TILE);
          g.fillStyle = COLORS.wallTop;
          g.fillRect(px, py, TILE, 7);
          g.fillStyle = 'rgba(255,255,255,0.10)';
          g.fillRect(px, py + 7, TILE, 2);
          g.fillStyle = COLORS.wallEdge;
          g.fillRect(px, py + TILE - 5, TILE, 5);
          g.strokeStyle = 'rgba(0,0,0,0.35)';
          g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        } else if (tile === CRATE) {
          drawCrate(g, px, py);
        } else if (tile === EXIT) {
          drawExitBase(g, px, py);
        } else if (tile === TERMINAL) {
          drawTerminalBase(g, px, py);
        } else if (zone === ZONE_LIT) {
          drawLampFixture(g, px + TILE / 2, py + TILE / 2);
        }
      }
    }
    floorText(g, 'SERVER VAULT', 19.1 * TILE, 2.4 * TILE, 'rgba(126,180,255,0.17)');
    floorText(g, 'ATRIUM', 3.1 * TILE, 5.7 * TILE, 'rgba(255,214,130,0.15)');
    floorText(g, 'EXIT', (EXIT_AT.x - 0.2) * TILE, 0.95 * TILE, 'rgba(96,240,170,0.4)');
    return off;
  }

  function drawCrate(g, px, py) {
    const m = 5;
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(px + 5, py + 7, TILE - 2, TILE - 2);
    g.fillStyle = COLORS.crate;
    g.fillRect(px + m, py + m, TILE - m * 2, TILE - m * 2);
    g.strokeStyle = COLORS.crateEdge;
    g.lineWidth = 2;
    g.strokeRect(px + m + 1, py + m + 1, TILE - m * 2 - 2, TILE - m * 2 - 2);
    g.lineWidth = 1;
    g.strokeStyle = COLORS.crateSlats;
    g.beginPath();
    g.moveTo(px + m, py + m); g.lineTo(px + TILE - m, py + TILE - m);
    g.moveTo(px + TILE - m, py + m); g.lineTo(px + m, py + TILE - m);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(px + m, py + m, TILE - m * 2, 3);
  }

  function drawExitBase(g, px, py) {
    g.fillStyle = '#0c1410';
    g.fillRect(px, py, TILE, TILE);
    g.strokeStyle = '#274436';
    g.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
    g.fillStyle = 'rgba(90,255,190,0.6)';
    for (let i = 0; i < 3; i += 1) g.fillRect(px + 10 + i * 10, py + 14, 6, 4);
  }

  function drawTerminalBase(g, px, py) {
    g.fillStyle = '#141a26';
    g.fillRect(px + 8, py + 8, TILE - 16, TILE - 16);
    g.strokeStyle = '#2c3a52';
    g.strokeRect(px + 8.5, py + 8.5, TILE - 17, TILE - 17);
    g.fillStyle = 'rgba(90,200,255,0.5)';
    g.fillRect(px + 13, py + 14, 22, 4);
    g.fillStyle = 'rgba(90,200,255,0.3)';
    g.fillRect(px + 13, py + 21, 16, 3);
    g.fillRect(px + 13, py + 27, 20, 3);
  }

  function drawLampFixture(g, cx, cy) {
    g.fillStyle = '#3a3325';
    g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd98c';
    g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
  }

  function floorText(g, text, x, y, color) {
    g.font = `700 13px ${MONO}`;
    g.fillStyle = color;
    g.textAlign = 'left';
    g.fillText(text, x, y);
  }

  // ---------- dynamic pass ----------

  function radial(x, y, r, color) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawGlows(state) {
    ctx.globalCompositeOperation = 'lighter';
    const t = state.time;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const i = y * COLS + x;
        if (world.zones[i] !== ZONE_LIT) continue;
        const flick = 0.92 + 0.08 * Math.sin(t * 9 + x * 3.7);
        radial((x + 0.5) * TILE, (y + 0.5) * TILE, TILE * 2.1, `rgba(255,196,110,${0.30 * flick})`);
      }
    }
    const tx = TERMINAL_AT.x * TILE, ty = TERMINAL_AT.y * TILE;
    const dataGlow = 0.5 + 0.5 * Math.sin(t * 5);
    radial(tx, ty, TILE * 2.4, state.hasData
      ? `rgba(80,255,190,${0.22 + dataGlow * 0.12})`
      : `rgba(90,200,255,${0.30 + dataGlow * 0.14})`);
    const ex = (EXIT_AT.x - 0.5) * TILE + TILE / 2, ey = (EXIT_AT.y - 0.5) * TILE + TILE / 2;
    const pulseE = 0.5 + 0.5 * Math.sin(t * 3.2);
    radial(ex, ey, TILE * 2.2, state.hasData
      ? `rgba(90,255,160,${0.30 + pulseE * 0.25})`
      : `rgba(255,90,80,${0.20 + pulseE * 0.12})`);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawRings(state) {
    for (const ring of state.rings) {
      const k = ring.age / ring.life;
      ctx.strokeStyle = `rgba(200,225,255,${0.22 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius * (0.25 + 0.75 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Occluded vision cone: march rays across the arc and close the polygon along wall hits. */
  function coneShape(g) {
    const rays = 46;
    const pts = [[g.x, g.y]];
    for (let i = 0; i <= rays; i += 1) {
      const angle = g.face - GUARD.coneHalf + (i / rays) * GUARD.coneHalf * 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let dist = 0;
      const stepLen = 14;
      while (dist < GUARD.coneRange) {
        dist += stepLen;
        const px = g.x + dx * dist, py = g.y + dy * dist;
        const tile = tileAt(world.grid, Math.floor(px / TILE), Math.floor(py / TILE));
        if (tile === WALL || tile === CRATE) { dist -= stepLen * 0.55; break; }
      }
      dist = Math.min(dist, GUARD.coneRange);
      pts.push([g.x + dx * dist, g.y + dy * dist]);
    }
    return pts;
  }

  function drawCone(state, g) {
    const pts = coneShape(g);
    const det = g.detection;
    const chase = g.state === 2;
    const susp = g.state === 1;
    const flashA = susp ? 0.55 + 0.45 * Math.sin(state.time * 12) : 1;
    const c = [255, Math.round(214 - 130 * Math.min(det * 1.4, 1)), Math.round(110 - 40 * Math.min(det * 1.6, 1))];
    if (chase) { c[0] = 255; c[1] = 84; c[2] = 62; }
    const a = (0.14 + 0.22 * det) * flashA;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    const grad = ctx.createRadialGradient(g.x, g.y, 12, g.x, g.y, GUARD.coneRange);
    grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a + 0.18})`);
    grad.addColorStop(0.55, `rgba(${c[0]},${c[1]},${c[2]},${a * 0.7})`);
    grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle = grad;
    ctx.fill();
    const core = ctx.createRadialGradient(g.x, g.y, 4, g.x, g.y, TILE * 1.7);
    core.addColorStop(0, `rgba(255,244,214,${0.34 * flashA})`);
    core.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = core;
    ctx.fill();
    ctx.restore();
  }

  function drawGuard(state, g) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + 10, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const alert = g.state === 2;
    ctx.fillStyle = alert ? '#ff6a55' : COLORS.guard;
    ctx.beginPath();
    ctx.arc(g.x, g.y, GUARD.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(g.x - 4, g.y - 5, GUARD.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#232a3c';
    ctx.beginPath();
    ctx.arc(g.x, g.y, GUARD.radius, Math.PI * 0.85, Math.PI * 2.15);
    ctx.fill();
    const vx = g.x + Math.cos(g.face) * 7, vy = g.y + Math.sin(g.face) * 7;
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.ellipse(vx, vy, 5.5, 3.2, g.face, 0, Math.PI * 2);
    ctx.fill();
    if (g.detection > 0.06) {
      const col = g.detection > GUARD.chaseAt ? '#ff5c4a' : '#ffd66e';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(g.detection, 1));
      ctx.stroke();
    }
    if (g.state === 1 || g.state === 3) {
      ctx.font = `700 15px ${MONO}`;
      ctx.fillStyle = g.state === 1 ? '#ffd66e' : '#9fb4d8';
      ctx.textAlign = 'center';
      ctx.fillText('?', g.x, g.y - 26);
    }
    if (g.state === 2) {
      ctx.font = `700 15px ${MONO}`;
      ctx.fillStyle = '#ff5c4a';
      ctx.textAlign = 'center';
      ctx.fillText('!', g.x, g.y - 26);
    }
    ctx.restore();
  }

  function drawPlayer(state, screen) {
    if (screen === SCREEN_TITLE) return;
    const p = world.player;
    const r = p.sneak ? 10.5 : PLAYER.radius;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 9, r * 1.05, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, TILE * PLAYER.light);
    glow.addColorStop(0, 'rgba(70,230,205,0.20)');
    glow.addColorStop(1, 'rgba(70,230,205,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - TILE * PLAYER.light, p.y - TILE * PLAYER.light, TILE * PLAYER.light * 2, TILE * PLAYER.light * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = p.sneak ? '#2bb79e' : COLORS.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,20,18,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const vx = p.x + Math.cos(p.face) * r * 0.5, vy = p.y + Math.sin(p.face) * r * 0.5;
    ctx.fillStyle = '#eafffb';
    ctx.beginPath();
    ctx.ellipse(vx, vy, 4.6, 2.6, p.face, 0, Math.PI * 2);
    ctx.fill();
    if (state.hasData) {
      const t = state.time * 4;
      ctx.fillStyle = '#5affbe';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(t) * 14, p.y + Math.sin(t) * 14, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette(state, screen) {
    const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
    grad.addColorStop(0, 'rgba(3,6,12,0)');
    grad.addColorStop(1, 'rgba(3,6,12,0.62)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const alertK = state.alertAny
      ? 0.5 + 0.5 * Math.sin(state.time * 7)
      : Math.max(state.alarm - 0.55, 0) / 0.45;
    if (alertK > 0.02 && screen === SCREEN_PLAY) {
      const edge = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.36, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
      edge.addColorStop(0, 'rgba(255,60,40,0)');
      edge.addColorStop(1, `rgba(255,60,40,${0.24 * alertK})`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  // ---------- HUD ----------

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,12,20,0.72)';
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,180,230,0.16)';
    ctx.lineWidth = 1;
    roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 8);
    ctx.stroke();
  }

  function spaced(text, x, y, spacing) {
    let cx = x;
    for (const ch of text) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + spacing;
    }
    return cx - spacing - x;
  }

  function drawHud(state, extras) {
    const p = world.player;
    panel(14, 14, 250, 64);
    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = 'rgba(160,190,235,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText('OBJECTIVES', 28, 34);
    ctx.font = `600 13px ${MONO}`;
    ctx.fillStyle = state.hasData ? '#4be3a4' : '#e8eef8';
    ctx.fillText(`${state.hasData ? '✓' : '◆'} STEAL THE DATA CORE`, 28, 54);
    ctx.fillStyle = state.hasData ? '#e8eef8' : 'rgba(210,220,240,0.45)';
    ctx.fillText(`${state.hasData ? '◆' : '·'} REACH THE EXIT`, 28, 71);

    panel(VIEW_W - 264, 14, 250, 74);
    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = 'rgba(160,190,235,0.85)';
    const labelW = spaced('ALARM', VIEW_W - 250, 34, 3);
    const barX = VIEW_W - 250 + labelW + 12, barW = VIEW_W - 28 - barX;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(barX, 26, barW, 9);
    const ak = Math.min(state.alarm, 1);
    ctx.fillStyle = ak > 0.6 ? '#ff5c4a' : ak > 0.25 ? '#ffb54d' : '#ffd66e';
    ctx.fillRect(barX, 26, barW * ak, 9);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(barX + 0.5, 26.5, barW - 1, 8);

    const noiseLabel = spaced('NOISE', VIEW_W - 250, 58, 3);
    const nbX = VIEW_W - 250 + noiseLabel + 12;
    const bars = p.sneak ? 1 : p.moving ? 4 : 0;
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = i < bars ? (bars >= 4 ? 'rgba(255,150,90,1)' : '#8fd6ff') : 'rgba(255,255,255,0.10)';
      ctx.fillRect(nbX + i * 16, 48, 11, 12);
    }
    const st = state.alertAny ? STATUS.alert : (state.alarm > 0.02 ? STATUS.suspicious : STATUS.hidden);
    ctx.font = `800 15px ${MONO}`;
    ctx.fillStyle = st[1];
    spaced(st[0], VIEW_W - 250, 79, 4);
    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = 'rgba(160,190,235,0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(state.time), VIEW_W - 28, 79);

    ctx.font = `500 12px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(170,195,235,0.55)';
    ctx.fillText('WASD MOVE   SHIFT SNEAK   E INTERACT   M SOUND   R RESTART', 16, VIEW_H - 14);
    if (extras && extras.muted) {
      ctx.fillStyle = 'rgba(170,195,235,0.85)';
      ctx.textAlign = 'right';
      ctx.fillText('SOUND OFF', VIEW_W - 16, VIEW_H - 14);
    }
  }

  function drawToast(state) {
    const a = Math.min(state.messageTimer * 2, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `700 15px ${MONO}`;
    const w = ctx.measureText(state.message).width + 40;
    panel(VIEW_W / 2 - w / 2, 108, w, 34);
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(state.message, VIEW_W / 2, 130);
    ctx.restore();
  }

  function formatTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ---------- screens ----------

  function drawTitle(state) {
    ctx.fillStyle = 'rgba(4,7,13,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#58e6c9';
    ctx.font = `600 14px ${MONO}`;
    spaced('- CLASSIFIED OPERATION -', VIEW_W / 2 - 110, 208, 4);
    ctx.fillStyle = '#f2f6ff';
    ctx.font = '800 72px Futura, "Avenir Next", "Segoe UI", sans-serif';
    spaced('UMBRA', VIEW_W / 2 - 118, 292, 14);
    ctx.fillStyle = '#ffd66e';
    spaced('PROTOCOL', VIEW_W / 2 - 168, 366, 22);
    ctx.strokeStyle = 'rgba(88,230,201,0.5)';
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 - 250, 396);
    ctx.lineTo(VIEW_W / 2 + 250, 396);
    ctx.stroke();
    ctx.font = `600 16px ${MONO}`;
    ctx.fillStyle = 'rgba(205,220,245,0.85)';
    ctx.fillText('steal the data core · slip past the sentries · leave no trace', VIEW_W / 2, 428);
    if (Math.sin(state.time * 4) > -0.2) {
      ctx.font = `700 18px ${MONO}`;
      ctx.fillStyle = '#ffffff';
      spaced('PRESS ENTER TO INFILTRATE', VIEW_W / 2 - 150, 486, 4);
    }
    ctx.font = `500 13px ${MONO}`;
    ctx.fillStyle = 'rgba(170,195,235,0.6)';
    ctx.fillText('WASD / ARROWS move · SHIFT sneak · E interact · P pause · M sound · R restart', VIEW_W / 2, 560);
    ctx.fillStyle = 'rgba(170,195,235,0.4)';
    ctx.fillText('guards see in cones — walls and crates break their line of sight', VIEW_W / 2, 584);
  }

  function drawCenterPanel(title, sub, color, subColor) {
    ctx.fillStyle = 'rgba(4,7,13,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = '800 54px Futura, "Avenir Next", "Segoe UI", sans-serif';
    ctx.fillStyle = color;
    spaced(title, VIEW_W / 2 - title.length * 18, VIEW_H / 2 - 6, 8);
    ctx.font = `600 16px ${MONO}`;
    ctx.fillStyle = subColor ?? 'rgba(205,220,245,0.8)';
    ctx.fillText(sub, VIEW_W / 2, VIEW_H / 2 + 34);
  }

  function drawCaught(state) {
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 6);
    ctx.fillStyle = `rgba(60,6,6,${0.52 + pulse * 0.1})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = '800 64px Futura, "Avenir Next", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ff5c4a';
    spaced('COMPROMISED', VIEW_W / 2 - 232, VIEW_H / 2 - 40, 12);
    ctx.font = `600 17px ${MONO}`;
    ctx.fillStyle = 'rgba(255,220,210,0.9)';
    ctx.fillText('a sentry made you — the floor went to lockdown', VIEW_W / 2, VIEW_H / 2);
    ctx.fillStyle = 'rgba(255,220,210,0.65)';
    ctx.fillText(`time ${formatTime(state.time)} · times spotted ${state.spottedCount}`, VIEW_W / 2, VIEW_H / 2 + 30);
    ctx.font = `700 18px ${MONO}`;
    ctx.fillStyle = '#ffffff';
    spaced('PRESS R TO TRY AGAIN', VIEW_W / 2 - 116, VIEW_H / 2 + 86, 4);
  }

  function drawWin(state) {
    ctx.fillStyle = 'rgba(4,22,16,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = '800 64px Futura, "Avenir Next", "Segoe UI", sans-serif';
    ctx.fillStyle = '#5affbe';
    spaced('EXFILTRATED', VIEW_W / 2 - 218, VIEW_H / 2 - 46, 12);
    ctx.font = `600 17px ${MONO}`;
    ctx.fillStyle = 'rgba(220,255,240,0.9)';
    ctx.fillText(`time ${formatTime(state.time)} · times spotted ${state.spottedCount}`, VIEW_W / 2, VIEW_H / 2 - 6);
    const rating = state.spottedCount === 0 ? 'GHOST — they never knew you were there'
      : state.spottedCount <= 2 ? 'PHANTOM — a blur on the cameras' : 'OPERATIVE — loud but alive';
    ctx.fillStyle = state.spottedCount === 0 ? '#ffd66e' : 'rgba(220,255,240,0.75)';
    ctx.fillText(rating, VIEW_W / 2, VIEW_H / 2 + 26);
    ctx.font = `700 18px ${MONO}`;
    ctx.fillStyle = '#ffffff';
    spaced('PRESS ENTER FOR TITLE', VIEW_W / 2 - 128, VIEW_H / 2 + 84, 4);
  }

  return { draw };
}
