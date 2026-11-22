// Boot and the one loop: input is polled every frame, the world advances in fixed 1/60 s steps,
// and the renderer paints what is there. Screens: title -> play -> caught (R) or win (Enter).
//
// ?shot=title|sneak|alert|win|caught stages a scene for screenshots: it paints twice and sets
// window.__shotReady so a headless browser knows when to capture.
import { STEP } from './config.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { createWorld, EVENT_CAUGHT, EVENT_DATA, EVENT_SPOTTED, EVENT_STEP_LOUD, EVENT_STEP_QUIET, EVENT_WIN } from './world.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld();
const renderer = createRenderer(canvas, world);
const audio = createAudio();
const input = createInput();
const extras = { muted: false };

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, extras);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let wasChasing = false;

  function startPlay() {
    world.reset();
    accumulator = 0;
    wasChasing = false;
    screen = SCREEN_PLAY;
    announce('Infiltration started. Steal the data core, then reach the exit.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (!actions) return;
    if (actions & ACTION_MUTE) {
      extras.muted = audio.toggleMute();
      announce(extras.muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startPlay();
      else if (screen === SCREEN_WIN) { screen = SCREEN_TITLE; announce('Title.'); }
      else if (screen === SCREEN_CAUGHT) startPlay();
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) startPlay();
    if (actions & ACTION_PAUSE && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      screen = screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      announce(screen === SCREEN_PAUSED ? 'Paused.' : 'Playing.');
    }
    if (actions & ACTION_INTERACT && screen === SCREEN_PLAY) input.held.interact = true;
    if (actions & (ACTION_CONFIRM | ACTION_RESTART)) audio.resume();
  }

  function handleEvents(events) {
    if (events & EVENT_STEP_QUIET) audio.step(true);
    if (events & EVENT_STEP_LOUD) audio.step(false);
    if (events & EVENT_SPOTTED) audio.suspicious();
    if (events & EVENT_DATA) { audio.pickup(); announce('Data core secured.'); }
    if (events & EVENT_WIN) { audio.win(); screen = SCREEN_WIN; announce('Exfiltrated.'); }
    if (events & EVENT_CAUGHT) { audio.caught(); screen = SCREEN_CAUGHT; announce('Compromised. Press R to try again.'); }
    const chasing = world.state.alertAny;
    if (chasing && !wasChasing) audio.alert();
    wasChasing = chasing;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        const demo = screen === SCREEN_TITLE;
        const events = world.step(STEP, demo
          ? { left: false, right: false, up: false, down: false, sneak: true, interact: false }
          : input.held, demo);
        if (!demo) handleEvents(events);
        accumulator -= STEP;
      }
    } else {
      world.state.time += 0; // frozen on end screens
      accumulator = 0;
    }
    renderer.draw(world.state, screen, extras);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('UMBRA PROTOCOL. Press Enter or click to infiltrate.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
