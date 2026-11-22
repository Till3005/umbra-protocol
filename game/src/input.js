// Keyboard + mouse. Movement keys and modifiers are polled each frame; one-shot actions
// (confirm, pause, interact, mute, restart) are queued as a bitmask and taken once.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;
export const ACTION_SNEAK = 32;

export function createInput() {
  const held = { left: false, right: false, up: false, down: false, sneak: false, interact: false };
  let queued = 0;

  function keyAction(code) {
    switch (code) {
      case 'Enter': case 'Space': return ACTION_CONFIRM;
      case 'KeyE': return ACTION_INTERACT;
      case 'KeyP': return ACTION_PAUSE;
      case 'KeyM': return ACTION_MUTE;
      case 'KeyR': return ACTION_RESTART;
      default: return 0;
    }
  }
  function keyDir(code, down) {
    switch (code) {
      case 'KeyW': case 'ArrowUp': held.up = down; return;
      case 'KeyS': case 'ArrowDown': held.down = down; return;
      case 'KeyA': case 'ArrowLeft': held.left = down; return;
      case 'KeyD': case 'ArrowRight': held.right = down; return;
      case 'ShiftLeft': case 'ShiftRight': held.sneak = down; return;
      default: return;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) { keyDir(e.code, true); return; }
    const action = keyAction(e.code);
    if (action) {
      queued |= action;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    }
    keyDir(e.code, true);
  });
  window.addEventListener('keyup', (e) => keyDir(e.code, false));
  window.addEventListener('mousedown', () => { queued |= ACTION_CONFIRM; });
  window.addEventListener('blur', () => {
    held.left = held.right = held.up = held.down = held.sneak = false;
  });

  return {
    held,
    /** One-shot actions since the last call. */
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
  };
}
