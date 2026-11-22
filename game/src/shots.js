// The staged scenes behind ?shot=title|sneak|alert|win. Each resets a real world, places the
// actors by hand for a readable frame, ticks the simulation so cones/light are live, and returns
// the screen to draw. ?shot frames are what the game genuinely renders — no compositing.
import { STEP, TILE } from './config.js';
import { SCREEN_CAUGHT, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { STATE_CHASE, STATE_SUSPICIOUS } from './world.js';

function place(guard, tx, ty, face, state, detection) {
  guard.x = (tx + 0.5) * TILE;
  guard.y = (ty + 0.5) * TILE;
  guard.face = face;
  guard.detection = detection;
  guard.state = state;
  guard.pause = 0;
}

function ring(world, tx, ty, radiusTiles) {
  world.state.rings.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, radius: radiusTiles * TILE, age: 0.18, life: 0.55 });
}

export function stageShot(name, world) {
  world.reset();
  const s = world.state;
  if (name === 'sneak' || name === 'alert' || name === 'win' || name === 'caught') {
    // Arrange the four sentries and the intruder for a legible frame.
    place(world.guards[0], 5, 12.5, 0, 0, 0);            // bottom corridor, walking right
    place(world.guards[1], 10, 6.5, Math.PI / 2, 0, 0);  // hall slit, facing down
    place(world.guards[2], 18, 5.5, 0, 0, 0);            // right room, walking right
    place(world.guards[3], 11, 1.5, 0, 0, 0);            // top corridor, walking right
    world.player.x = 10.5 * TILE;
    world.player.y = 9.4 * TILE;
    world.player.face = Math.PI / 2;
    world.player.sneak = true;
    s.time = 12;
  }
  if (name === 'sneak') {
    world.guards[1].detection = 0.52;
    world.guards[1].state = STATE_SUSPICIOUS;
    s.alarm = 0.42;
    s.spottedCount = 1;
    ring(world, 10, 9, 2.8);
    for (let i = 0; i < Math.floor(0.05 / STEP); i += 1) world.step(STEP, silentInput());
    return { screen: SCREEN_PLAY };
  }
  if (name === 'alert') {
    world.player.x = 11.5 * TILE;
    world.player.y = 10.5 * TILE;
    world.player.face = Math.PI / 2;
    world.player.sneak = false;
    place(world.guards[1], 11, 7.5, Math.PI / 2, STATE_CHASE, 0.88);
    s.alarm = 0.86;
    s.alertAny = true;
    s.spottedCount = 2;
    ring(world, 11, 9, 2.8);
    ring(world, 11, 8, 2.8);
    for (let i = 0; i < Math.floor(0.35 / STEP); i += 1) world.step(STEP, silentInput());
    return { screen: SCREEN_PLAY };
  }
  if (name === 'win') {
    world.player.x = 22.5 * TILE;
    world.player.y = 1.5 * TILE;
    world.player.face = 0;
    s.hasData = true;
    s.won = true;
    s.time = 83;
    s.spottedCount = 0;
    return { screen: SCREEN_WIN };
  }
  if (name === 'caught') {
    world.player.x = 10.5 * TILE;
    world.player.y = 8.5 * TILE;
    place(world.guards[1], 10, 6.5, Math.PI / 2, STATE_CHASE, 1);
    s.caught = true;
    s.alarm = 1;
    s.time = 47;
    s.spottedCount = 3;
    return { screen: SCREEN_CAUGHT };
  }
  // title: let the guards patrol a little so the backdrop feels alive
  for (let i = 0; i < Math.floor(6.4 / STEP); i += 1) world.step(STEP, silentInput());
  return { screen: SCREEN_TITLE };
}

function silentInput() {
  return { left: false, right: false, up: false, down: false, sneak: false, interact: false };
}
