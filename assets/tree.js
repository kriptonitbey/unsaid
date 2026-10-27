/* Unsaid: draws a sentence the way the collection does.
   The bright line is the sentence; at each word, faint branches for the words that could have come next,
   a few "ghosts" that carried on for a while, and a tick per word underneath.
   Deterministic: the same sentence always draws the same tree. */
(function () {
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return function () {                       // mulberry32
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }

  function build(sentence) {
    const r = seeded(sentence), words = sentence.split(/\s+/), n = words.length;
    let ys = [0];
    for (let i = 0; i < n; i++) ys.push(ys[i] + gauss(r));
    const lo = Math.min(...ys), hi = Math.max(...ys), span = (hi - lo) || 1;
    const amp = n > 2 ? .22 + r() * .2 : 0;
    ys = ys.map(y => ((y - lo) / span - .5) * amp);
    const probs = [], alts = [];
    for (let i = 0; i < n; i++) {
      const p = Math.min(.95, Math.max(.12, .25 + .7 * Math.sqrt(r()) - .1 * r()));
      probs.push(p);
      const k = n > 3 ? 6 + Math.floor(r() * 8) : 16 + Math.floor(r() * 10);
      const shares = Array.from({ length: k }, () => r() ** 2), sum = shares.reduce((a, b) => a + b, 0) || 1;
      alts.push(shares.map(s => {
        const share = (1 - p) * s / sum;
        const alt = { dy: (r() * 2 - 1) * (.06 + .24 * (1 - p)), share, ghost: null };
        if (share > .04 && r() < .6) {
          alt.ghost = []; const steps = 2 + Math.floor(r() * 5);
          for (let g = 0; g < steps; g++) alt.ghost.push([.7 + r() * .4, gauss(r) * .04]);
        }
        return alt;
      }));
    }
    return { words, n, ys, probs, alts };
  }

  function curve(ctx, x0, y0, x1, y1) {
    const c = (x1 - x0) / 2;
    ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + c, y0, x1 - c, y1, x1, y1);
  }

  /* o: { upto: words drawn (may be fractional), br, gh, tk: 0–1 layer strengths, pal: {line, alt, ghost, glow} } */
  function draw(ctx, w, h, T, o) {
    const pal = o.pal || { line: "#f3efe8", alt: "#8d877e", ghost: "#5f5a53", glow: "rgba(243,239,232,.35)" };
    const m = w * .1, dx = (w - 2 * m) / Math.max(1, T.n), mid = h * .44, S = Math.min(w, h * 1.15), u = w / 700;
    const X = i => m + i * dx, Y = i => mid + T.ys[i] * S;
    const upto = Math.max(0, Math.min(T.n, o.upto ?? T.n));
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    for (let i = 0; i < Math.ceil(upto); i++) {
      const f = Math.min(1, upto - i);                  // how far this word has arrived
      for (const a of T.alts[i]) {
        const x0 = X(i), y0 = Y(i), x1 = X(i + 1), y1 = y0 + a.dy * h;
        if (o.br > 0) {
          ctx.globalAlpha = Math.min(1, .14 + 2.2 * a.share) * o.br * f;
          ctx.strokeStyle = pal.alt; ctx.lineWidth = Math.max(.6, (.6 + 3.5 * a.share) * u);
          ctx.beginPath(); curve(ctx, x0, y0, x1, y1); ctx.stroke();
          ctx.fillStyle = pal.alt; ctx.beginPath(); ctx.arc(x1, y1, (1.3 + 4 * a.share) * u, 0, 7); ctx.fill();
        }
        if (a.ghost && o.gh > 0) {
          let cx = x1, cy = y1, fade = Math.min(.7, (.16 + 2.2 * a.share) * 1.1);
          ctx.strokeStyle = pal.ghost; ctx.lineWidth = 1.3 * u;
          for (const [kx, ky] of a.ghost) {
            const nx = cx + dx * kx, ny = cy + ky * h;
            if (nx > w - m * .4) break;
            ctx.globalAlpha = fade * o.gh * f;
            ctx.beginPath(); curve(ctx, cx, cy, nx, ny); ctx.stroke();
            cx = nx; cy = ny; fade *= .78;
          }
        }
      }
    }

    // the sentence itself
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, X(0) + upto * dx + 1, h); ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < T.n; i++) curve(ctx, X(i), Y(i), X(i + 1), Y(i + 1));
    ctx.globalAlpha = 1; ctx.strokeStyle = pal.glow; ctx.lineWidth = 9 * u; ctx.stroke();
    ctx.strokeStyle = pal.line; ctx.lineWidth = 2.4 * u; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = pal.line; ctx.globalAlpha = 1;
    for (let i = 0; i <= Math.floor(upto); i++) {
      const p = i ? T.probs[i - 1] : 1;
      ctx.beginPath(); ctx.arc(X(i), Y(i), (2.4 + 4.6 * p) * u, 0, 7); ctx.fill();
    }

    if (o.tk > 0) {                                      // one tick per word: taller = surer
      const base = Math.min(h - m * .75, mid + S * .3);
      ctx.globalAlpha = .35 * o.tk; ctx.strokeStyle = pal.alt; ctx.lineWidth = 1 * u;
      ctx.beginPath(); ctx.moveTo(X(0), base); ctx.lineTo(X(T.n), base); ctx.stroke();
      ctx.globalAlpha = .8 * o.tk; ctx.strokeStyle = pal.line; ctx.lineWidth = 1.4 * u;
      for (let i = 0; i <= Math.floor(upto); i++) {
        const p = i ? T.probs[i - 1] : 1;
        ctx.beginPath(); ctx.moveTo(X(i), base); ctx.lineTo(X(i), base - (5 + 18 * p) * u); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function fit(canvas) {
    const r = canvas.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d);
    const ctx = canvas.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  window.UnsaidTree = { build, draw, fit };
})();
