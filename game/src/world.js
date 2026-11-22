// The rules and state, no drawing and no browser in it. One step() per fixed tick advances the
// player, the guards (patrol -> suspicious -> chase), detection, the alarm and the noise. Walls
// and crates block sight via a segment/box raycast. Returns bit flags so the shell can react.
import {
  ALARM_DECAY, COLS, CRATE, EXIT, EXIT_AT, FLOOR, GUARD, GUARDS, LIGHT_RATE, MAP,
  PLAYER, PLAYER_START, ROWS, STEP, TERMINAL, TERMINAL_AT, TILE, WALL, ZONE_DARK, ZONE_LIT, ZONE_NORMAL,
} from './config.js';

export const EVENT_SPOTTED = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_DATA = 4;
export const EVENT_WIN = 8;
export const EVENT_STEP_QUIET = 16;
export const EVENT_STEP_LOUD = 32;

export const STATE_TITLE = 0;
export const STATE_PLAY = 1;
export const STATE_PATROL = 0, STATE_SUSPICIOUS = 1, STATE_CHASE = 2, STATE_INVESTIGATE = 3;

/** Solid to movement and sight. */
export function tileAt(grid, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return WALL;
  return grid[ty * COLS + tx];
}

export function zoneAt(zones, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return ZONE_NORMAL;
  return zones[ty * COLS + tx];
}

export function walkable(tile) {
  return tile === FLOOR || tile === TERMINAL || tile === EXIT;
}

/** Does the segment a->b cross any solid tile's box? Cheap DDA over the tiles it passes. */
function lineOfSight(grid, ax, ay, bx, by) {
  let x = Math.floor(ax / TILE), y = Math.floor(ay / TILE);
  const x1 = Math.floor(bx / TILE), y1 = Math.floor(by / TILE);
  const dx = bx - ax, dy = by - ay;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(TILE / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(TILE / dy);
  let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? (x + 1) * TILE - ax : ax - x * TILE)) / Math.abs(dx);
  let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? (y + 1) * TILE - ay : ay - y * TILE)) / Math.abs(dy);
  for (;;) {
    if (tileAt(grid, x, y) === WALL || tileAt(grid, x, y) === CRATE) return false;
    if (x === x1 && y === y1) return true;
    if (tMaxX < tMaxY) { if (tMaxX > 1) return true; x += stepX; tMaxX += tDeltaX; }
    else { if (tMaxY > 1) return true; y += stepY; tMaxY += tDeltaY; }
  }
}

function easeAngle(current, target, rate, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const move = rate * dt;
  if (Math.abs(diff) <= move) return target;
  return current + Math.sign(diff) * move;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function createWorld() {
  const grid = new Uint8Array(COLS * ROWS);
  const zones = new Uint8Array(COLS * ROWS);
  let startX = PLAYER_START.x * TILE, startY = PLAYER_START.y * TILE;
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const c = MAP[y][x] ?? '#';
      const i = y * COLS + x;
      if (c === '#') grid[i] = WALL;
      else if (c === 'C') grid[i] = CRATE;
      else if (c === 'T') grid[i] = TERMINAL;
      else if (c === 'X') grid[i] = EXIT;
      else grid[i] = FLOOR;
      zones[i] = c === ',' ? ZONE_DARK : c === '*' ? ZONE_LIT : ZONE_NORMAL;
      if (c === 'P') { startX = (x + 0.5) * TILE; startY = (y + 0.5) * TILE; }
    }
  }

  const player = { x: startX, y: startY, face: -Math.PI / 2, sneak: false, moving: false, stepTimer: 0, noise: 0 };
  const guards = GUARDS.map((spec, index) => ({
    index, name: spec.name,
    x: (spec.waypoints[0][0] + 0.5) * TILE,
    y: (spec.waypoints[0][1] + 0.5) * TILE,
    waypoints: spec.waypoints.map(([tx, ty]) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE })),
    leg: 1 % spec.waypoints.length,
    face: 0, state: STATE_PATROL, detection: 0, pause: 0,
    lastSeenX: 0, lastSeenY: 0, investigateX: 0, investigateY: 0, investigateTimer: 0,
    scanPhase: index * 1.7, repathTimer: 0, path: null,
  }));

  // BFS flood from the player tile; chasing guards descend the gradient.
  const flow = new Int16Array(COLS * ROWS);
  const queue = new Int16Array(COLS * ROWS);

  function computeFlow() {
    flow.fill(30000);
    const px = clamp(Math.floor(player.x / TILE), 0, COLS - 1);
    const py = clamp(Math.floor(player.y / TILE), 0, ROWS - 1);
    if (!walkable(tileAt(grid, px, py))) return;
    let head = 0, tail = 0;
    queue[tail++] = py * COLS + px;
    flow[py * COLS + px] = 0;
    while (head < tail) {
      const i = queue[head++];
      const d = flow[i];
      const x = i % COLS, y = (i - x) / COLS;
      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
        const j = ny * COLS + nx;
        if (flow[j] <= d + 1 || !walkable(tileAt(grid, nx, ny))) return;
        flow[j] = d + 1;
        queue[tail++] = j;
      };
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
  }

  const state = {
    screenTime: 0, time: 0, alarm: 0, hasData: false, caught: false, won: false,
    spottedCount: 0, alertAny: false, rings: [], flowAge: 99, message: '', messageTimer: 0,
    flashTimer: 0, startTileX: Math.floor(startX / TILE), startTileY: Math.floor(startY / TILE),
  };

  function reset() {
    player.x = startX; player.y = startY; player.face = -Math.PI / 2;
    player.sneak = false; player.moving = false; player.noise = 0; player.stepTimer = 0;
    for (const g of guards) {
      g.x = g.waypoints[0].x; g.y = g.waypoints[0].y;
      g.leg = 1 % g.waypoints.length;
      const wp = g.waypoints[g.leg];
      g.face = Math.atan2(wp.y - g.y, wp.x - g.x);
      g.state = STATE_PATROL; g.detection = 0; g.pause = 0;
      g.investigateTimer = 0; g.path = null; g.repathTimer = 0;
    }
    state.time = 0; state.alarm = 0; state.hasData = false;
    state.caught = false; state.won = false; state.spottedCount = 0;
    state.alertAny = false; state.rings.length = 0; state.flowAge = 99;
    state.message = ''; state.messageTimer = 0; state.flashTimer = 0;
  }

  function flash(text, seconds) {
    state.message = text;
    state.messageTimer = seconds ?? 2;
  }

  function noiseAt(x, y, radius) {
    if (radius <= 0) return;
    for (const g of guards) {
      const dx = g.x - x, dy = g.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius * TILE) continue;
      const muffled = lineOfSight(grid, x, y, g.x, g.y) ? 1 : 0.55;
      if (dist > radius * TILE * muffled) continue;
      if (g.state === STATE_PATROL) {
        g.state = STATE_INVESTIGATE;
        g.investigateX = x; g.investigateY = y;
        g.investigateTimer = GUARD.investigateTime;
        g.detection = Math.max(g.detection, 0.18);
      } else if (g.state === STATE_SUSPICIOUS) {
        g.investigateX = x; g.investigateY = y;
      }
    }
  }

  /** Can the guard see the player right now? Also returns the facing error for cone edges. */
  function seesPlayer(g) {
    const dx = player.x - g.x, dy = player.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GUARD.coneRange) return false;
    const angle = Math.atan2(dy, dx);
    let diff = Math.abs(angle - g.face);
    while (diff > Math.PI) diff = Math.PI * 2 - diff;
    const slack = Math.atan2(PLAYER.radius, Math.max(dist, 1));
    if (diff > GUARD.coneHalf + slack) return false;
    return lineOfSight(grid, g.x, g.y, player.x, player.y);
  }

  function moveGuard(g, speed, dt) {
    const dx = player.x - g.x, dy = player.y - g.y;
    let tx, ty;
    if (g.state === STATE_CHASE) {
      const gx = clamp(Math.floor(g.x / TILE), 0, COLS - 1);
      const gy = clamp(Math.floor(g.y / TILE), 0, ROWS - 1);
      const here = flow[gy * COLS + gx];
      let best = null;
      for (const [nx, ny] of [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const d = flow[ny * COLS + nx];
        if (d < here && (best === null || d < best.d)) best = { x: (nx + 0.5) * TILE, y: (ny + 0.5) * TILE, d };
      }
      if (best === null || lineOfSight(grid, g.x, g.y, player.x, player.y)) {
        tx = player.x; ty = player.y;
      } else { tx = best.x; ty = best.y; }
    } else {
      tx = g.investigateX; ty = g.investigateY;
    }
    const vx = tx - g.x, vy = ty - g.y;
    const dist = Math.hypot(vx, vy);
    if (dist < 4) return false;
    g.x += (vx / dist) * speed * dt;
    g.y += (vy / dist) * speed * dt;
    g.face = easeAngle(g.face, Math.atan2(vy, vx), GUARD.turnSpeed * 1.6, dt);
    return true;
  }

  function guardStep(g, dt, demo) {
    const seen = !demo && seesPlayer(g);
    const zone = zoneAt(zones, Math.floor(player.x / TILE), Math.floor(player.y / TILE));
    if (seen) {
      const dist = Math.hypot(player.x - g.x, player.y - g.y);
      const proximity = 1.35 - 0.5 * (dist / GUARD.coneRange); // close = fast
      const sneakFactor = player.sneak ? 0.55 : 1;
      const rate = GUARD.seeBase * (LIGHT_RATE[zone] ?? 1) * proximity * sneakFactor;
      g.detection = clamp(g.detection + rate * dt, 0, 1);
      g.lastSeenX = player.x; g.lastSeenY = player.y;
      if (g.detection >= GUARD.suspiciousAt && g.state === STATE_PATROL) {
        g.state = STATE_SUSPICIOUS;
        state.spottedCount += 1;
        return EVENT_SPOTTED;
      }
    } else {
      const decay = g.state === STATE_CHASE ? GUARD.chaseDecay : GUARD.decay;
      g.detection = clamp(g.detection - decay * dt, 0, 1);
    }

    if (g.detection >= 1) return EVENT_CAUGHT;

    if (g.state === STATE_PATROL) {
      if (g.pause > 0) { g.pause -= dt; return 0; }
      const wp = g.waypoints[g.leg];
      const vx = wp.x - g.x, vy = wp.y - g.y;
      const dist = Math.hypot(vx, vy);
      if (dist < 4) {
        g.leg = (g.leg + 1) % g.waypoints.length;
        if (g.waypoints.length <= 2) g.pause = 0.5 + 0.5 * Math.abs(Math.sin(g.scanPhase += 1));
      } else {
        g.x += (vx / dist) * GUARD.patrol * dt;
        g.y += (vy / dist) * GUARD.patrol * dt;
        g.face = easeAngle(g.face, Math.atan2(vy, vx), GUARD.turnSpeed, dt);
      }
    } else if (g.state === STATE_SUSPICIOUS) {
      g.face = easeAngle(g.face, Math.atan2(player.y - g.y, player.x - g.x), GUARD.turnSpeed * 1.4, dt);
      if (g.detection >= GUARD.chaseAt || !seen) {
        if (g.detection >= GUARD.chaseAt) g.state = STATE_CHASE;
        else if (g.detection <= 0.05) g.state = STATE_PATROL;
      }
    } else if (g.state === STATE_CHASE) {
      if (g.detection <= 0.12 && !seen) {
        g.state = STATE_INVESTIGATE;
        g.investigateX = g.lastSeenX; g.investigateY = g.lastSeenY;
        g.investigateTimer = GUARD.investigateTime;
        return 0;
      }
      moveGuard(g, GUARD.chase, dt);
      const dist = Math.hypot(player.x - g.x, player.y - g.y);
      if (dist < GUARD.catchDist) return EVENT_CAUGHT;
    } else if (g.state === STATE_INVESTIGATE) {
      const arrived = !moveGuard(g, GUARD.patrol * 1.35, dt);
      g.investigateTimer -= dt;
      if (arrived) g.face = easeAngle(g.face, g.face + Math.sin(state.time * 2.2 + g.scanPhase) * 0.08, 3, dt);
      if (g.investigateTimer <= 0 && arrived) { g.state = STATE_PATROL; g.detection = Math.min(g.detection, 0.2); }
    }
    return 0;
  }

  function step(dt, input, demo = false) {
    let events = 0;
    if (state.caught || state.won) return events;
    state.time += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.flashTimer > 0) state.flashTimer -= dt;

    // Player movement (skipped on the title backdrop).
    let dx = 0, dy = 0;
    if (!demo) {
      if (input.left) dx -= 1;
      if (input.right) dx += 1;
      if (input.up) dy -= 1;
      if (input.down) dy += 1;
    }
    const moving = dx !== 0 || dy !== 0;
    player.sneak = input.sneak;
    player.moving = moving;
    if (moving) {
      const len = Math.hypot(dx, dy);
      const speed = input.sneak ? PLAYER.sneak : PLAYER.walk;
      const nx = player.x + (dx / len) * speed * dt;
      const ny = player.y + (dy / len) * speed * dt;
      const r = PLAYER.radius * 0.72;
      if (clearCircle(grid, nx, player.y, r)) player.x = nx;
      if (clearCircle(grid, player.x, ny, r)) player.y = ny;
      player.face = Math.atan2(dy, dx);
      player.stepTimer -= dt;
      if (player.stepTimer <= 0) {
        player.stepTimer = input.sneak ? 0.52 : 0.34;
        events |= input.sneak ? EVENT_STEP_QUIET : EVENT_STEP_LOUD;
        const radius = input.sneak ? 0 : 2.8;
        player.noise = input.sneak ? 0 : 1;
        if (radius > 0) {
          spawnRing(player.x, player.y, radius);
          noiseAt(player.x, player.y, radius);
        }
      }
    } else {
      player.noise = Math.max(0, player.noise - dt * 3);
    }

    // Interact.
    if (input.interact) {
      input.interact = false;
      if (!state.hasData) {
        const dist = Math.hypot(player.x - TERMINAL_AT.x * TILE, player.y - TERMINAL_AT.y * TILE);
        if (dist < TILE * 1.15) {
          state.hasData = true;
          events |= EVENT_DATA;
          flash('DATA CORE SECURED — REACH THE EXIT', 3);
        } else {
          flash('NOTHING HERE', 1);
        }
      }
    }

    // Guards.
    state.flowAge += dt;
    let anyChase = false, maxDetection = 0;
    for (const g of guards) {
      const ev = guardStep(g, dt, demo);
      if (ev & EVENT_SPOTTED) events |= EVENT_SPOTTED;
      if (ev & EVENT_CAUGHT) {
        state.caught = true;
        events |= EVENT_CAUGHT;
      }
      if (g.state === STATE_CHASE) {
        anyChase = true;
        if (state.flowAge > 0.35) events |= 64; // signal: recompute flow
      }
      maxDetection = Math.max(maxDetection, g.detection);
    }
    state.alertAny = anyChase;
    if (anyChase && state.flowAge > 0.35) { computeFlow(); state.flowAge = 0; }
    const target = anyChase ? Math.max(maxDetection, 0.8) : maxDetection;
    state.alarm += (target - state.alarm) * (target > state.alarm ? 6 : ALARM_DECAY * 4) * dt;
    state.alarm = clamp(state.alarm, 0, 1);

    // Rings.
    for (let i = state.rings.length - 1; i >= 0; i -= 1) {
      const ring = state.rings[i];
      ring.age += dt;
      if (ring.age >= ring.life) state.rings.splice(i, 1);
    }

    // Exit.
    if (!demo) {
      const ex = Math.floor(player.x / TILE), ey = Math.floor(player.y / TILE);
      if (ex === Math.floor(EXIT_AT.x) && ey === Math.floor(EXIT_AT.y)) {
        if (state.hasData) { state.won = true; events |= EVENT_WIN; }
        else if (state.messageTimer <= 0) flash('EXIT LOCKED — STEAL THE DATA CORE FIRST', 2);
      }
    }
    return events;
  }

  function spawnRing(x, y, radius) {
    state.rings.push({ x, y, radius: radius * TILE, age: 0, life: 0.55 });
    if (state.rings.length > 12) state.rings.shift();
  }

  reset();
  return { state, player, guards, grid, zones, flow, reset, step, flash, computeFlow };
}

/** Is a circle at (x,y) clear of solid tiles? */
export function clearCircle(grid, x, y, r) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      const tile = tileAt(grid, tx, ty);
      if (!walkable(tile)) {
        const bx = tx * TILE, by = ty * TILE;
        const cx = clamp(x, bx, bx + TILE), cy = clamp(y, by, by + TILE);
        if ((cx - x) * (cx - x) + (cy - y) * (cy - y) < r * r) return false;
      }
    }
  }
  return true;
}
