/* Unsaid: thunder for the lightning. A recorded crack (Mixkit, free licence) with a synthesised roll underneath.
   Audio only starts after a click, as browsers require. */
let ac = null, master = null, wet = null, white = null, brown = null, soundOn = false;
/* a real recording for the crack (Mixkit, free licence); fetched now, decoded once sound is allowed */
const recBytes = fetch("sound/thunder.mp3").then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
let rec = null, recReady = Promise.resolve(null);
function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ac.destination);
    master = ac.createGain(); master.gain.value = .8; master.connect(comp);
    const sr = ac.sampleRate, len = sr * 6;
    white = ac.createBuffer(1, len, sr); brown = ac.createBuffer(1, len, sr);
    const w = white.getChannelData(0), b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const r = Math.random() * 2 - 1; w[i] = r;
      last = (last + .02 * r) / 1.02; b[i] = last * 3.5;
    }
    const ir = ac.createBuffer(2, sr * 4, sr);          // sky echo: 4 s of decaying noise
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.6);
    }
    const conv = ac.createConvolver(); conv.buffer = ir;
    wet = ac.createGain(); wet.gain.value = .3;
    wet.connect(conv); conv.connect(master);
  }
  try { if (ac.state === "suspended") ac.resume(); } catch (e) { /* resumes on the next gesture */ }
  if (!audio.started) {                               // decode the recording once
    audio.started = true;
    recReady = recBytes.then(b => b ? new Promise((ok, no) => ac.decodeAudioData(b.slice(0), ok, no)) : null)
      .then(buf => (rec = buf)).catch(() => null);
  }
  return ac;
}
function out(node) { node.connect(master); node.connect(wet); }
function thunder(near) {                              // near: 0 far away … 1 overhead
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + (near > .8 ? .02 : (1 - near) * (.4 + Math.random() * 1.4));

  const useRec = rec && (near > .55 || Math.random() < .5);
  if (useRec) {
    // the recording: as it is overhead, slowed down and muffled when far away
    const src = a.createBufferSource(); src.buffer = rec;
    src.playbackRate.value = near > .8 ? .92 + Math.random() * .16 : .6 + Math.random() * .25;
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = near > .8 ? 18000 : 600 + near * 1600;
    const g = a.createGain(); g.gain.value = near > .8 ? 1 : .15 + near * .6;
    src.connect(lp); lp.connect(g); out(g);
    src.start(t0);
  }

  if (near > .55 && !useRec) {
    // the tear: 14–26 short cracks over ~0.35 s, getting quieter
    let t = t0; const n = 14 + Math.floor(Math.random() * 12);
    for (let i = 0; i < n; i++) {
      const src = a.createBufferSource(); src.buffer = white;
      const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900 + Math.random() * 3200; bp.Q.value = .8;
      const g = a.createGain(), amp = near * (1 - i / n) * (.4 + Math.random() * .6), len = .012 + Math.random() * .035;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .002); g.gain.exponentialRampToValueAtTime(.0005, t + len);
      src.connect(bp); bp.connect(g); out(g);
      src.start(t, Math.random() * 5); src.stop(t + len + .02);
      t += .004 + Math.random() * .028;
    }
    // the boom: a sine falling from ~75 Hz to ~28 Hz, plus a low thump of noise
    const osc = a.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(75, t0 + .02); osc.frequency.exponentialRampToValueAtTime(28, t0 + .9);
    const og = a.createGain();
    og.gain.setValueAtTime(0, t0); og.gain.linearRampToValueAtTime(.9 * near, t0 + .03); og.gain.exponentialRampToValueAtTime(.001, t0 + 1.6);
    osc.connect(og); out(og); osc.start(t0); osc.stop(t0 + 1.7);
    const th = a.createBufferSource(); th.buffer = brown;
    const tlp = a.createBiquadFilter(); tlp.type = "lowpass"; tlp.frequency.value = 220;
    const tg = a.createGain();
    tg.gain.setValueAtTime(0, t0); tg.gain.linearRampToValueAtTime(1.2 * near, t0 + .02); tg.gain.exponentialRampToValueAtTime(.001, t0 + .8);
    th.connect(tlp); tlp.connect(tg); out(tg); th.start(t0, Math.random() * 3); th.stop(t0 + .9);
  }

  // the roll: the first version's rumble, kept as it was
  const src = a.createBufferSource(); src.buffer = brown;
  src.playbackRate.value = .7 + Math.random() * .4;
  const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 160 + near * 650;
  const g = a.createGain();
  const peak = (near > .8 ? 1 : .12 + near * .45) * (useRec ? .55 : 1), dur = 2.4 + near * 2.4 + Math.random() * 1.2;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + .06 + (1 - near) * .5);
  for (let k = 1; k <= 6; k++) {
    g.gain.linearRampToValueAtTime(peak * (.35 + Math.random() * .65) * (1 - k / 8), t0 + dur * k / 7);
  }
  g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  src.connect(lp); lp.connect(g); out(g);
  src.start(t0, Math.random() * 2); src.stop(t0 + dur + .1);
}
