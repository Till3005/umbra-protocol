// Tiny WebAudio synth: footsteps, a suspicious tick, an alert sting, pickups and stingers.
// Everything is made from oscillators and noise bursts — no files. Starts muted-until-gesture;
// M toggles.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  }

  function env(node, peak, attack, decay) {
    const t = ctx.currentTime;
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function tone(type, from, to, peak, attack, decay, delay = 0) {
    if (!ensure() || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    const t = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + attack + decay);
    env(gain, peak, attack, decay);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  function noise(peak, decay, filterHz) {
    if (!ensure() || muted) return;
    const length = Math.ceil(ctx.sampleRate * decay);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterHz;
    const gain = ctx.createGain();
    gain.gain.value = peak;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  return {
    step(sneak) { noise(sneak ? 0.05 : 0.13, sneak ? 0.05 : 0.08, sneak ? 420 : 300); },
    suspicious() { tone('triangle', 620, 780, 0.12, 0.01, 0.16); },
    alert() {
      tone('sawtooth', 220, 440, 0.2, 0.02, 0.5);
      tone('sawtooth', 331, 662, 0.12, 0.02, 0.5, 0.03);
    },
    pickup() { tone('sine', 660, 660, 0.16, 0.01, 0.18); tone('sine', 990, 990, 0.14, 0.01, 0.3, 0.1); },
    locked() { tone('square', 160, 120, 0.1, 0.01, 0.2); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone('sine', f, f, 0.16, 0.02, 0.35, i * 0.12));
    },
    caught() {
      tone('sawtooth', 300, 70, 0.24, 0.01, 0.9);
      tone('square', 150, 40, 0.18, 0.01, 1.1, 0.05);
    },
    resume() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
  };
}
