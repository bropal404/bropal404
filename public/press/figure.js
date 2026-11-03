// Fig. 1 — an illustrative CUSUM change-point detector on simulated data.
// Two stacked panels share the sample axis (small multiples, not a dual axis).

const NS = 'http://www.w3.org/2000/svg';
const N = 150, CHANGE = 100, SHIFT = 1.0, K = SHIFT / 2, H = 6;

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gauss(r) { // Box–Muller
  let u = 0, v = 0;
  while (!u) u = r();
  while (!v) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Pick a seed whose run has no false alarm and a typical detection delay.
function simulate() {
  for (let seed = 11; seed < 500; seed++) {
    const r = rng(seed), x = [], s = [];
    let S = 0, alarm = -1;
    for (let n = 0; n < N; n++) {
      const v = gauss(r) + (n >= CHANGE ? SHIFT : 0);
      S = Math.max(0, S + v - K);
      x.push(v); s.push(S);
      if (alarm < 0 && S > H) alarm = n;
    }
    if (alarm >= CHANGE + 8 && alarm <= CHANGE + 16 && Math.max(...s.slice(0, CHANGE)) < H * .7) return { x, s, alarm, seed };
  }
  throw new Error('no seed');
}

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};

export function drawFigure(fig) {
  if (!fig) return;
  const host = fig.querySelector('.chart-body');
  const tip = fig.querySelector('.chart-tip');
  const data = simulate();

  // data table (the accessible view of what matters)
  const tb = fig.querySelector('#fig1-table tbody');
  tb.innerHTML = '';
  [['Samples', N], ['True change at', `n = ${CHANGE}`], ['Mean shift', `0 → ${SHIFT}`],
   ['CUSUM drift k', K], ['Threshold h', H], ['Alarm raised at', `n = ${data.alarm}`],
   ['Detection delay', `${data.alarm - CHANGE} samples`], ['False alarms before change', 'none']]
    .forEach(([k, v]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.textContent = k;
      const td = document.createElement('td'); td.textContent = v;
      tr.append(th, td); tb.append(tr);
    });

  let state = { n: -1 };
  const render = () => {
    const W = Math.max(280, host.clientWidth);
    const m = { l: 30, r: 14, t: 16, b: 24 };
    const h1 = 92, gap = 26, h2 = 128;
    const Ht = m.t + h1 + gap + h2 + m.b;
    const iw = W - m.l - m.r;
    const X = n => m.l + (n / (N - 1)) * iw;
    const y1min = -3, y1max = 4;
    const Y1 = v => m.t + (1 - (Math.min(y1max, Math.max(y1min, v)) - y1min) / (y1max - y1min)) * h1;
    const smax = Math.ceil(Math.max(...data.s) / 5) * 5;
    const top2 = m.t + h1 + gap;
    const Y2 = v => top2 + (1 - v / smax) * h2;

    host.innerHTML = '';
    const svg = el('svg', { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht }, host);

    // recessive grid
    [-2, 0, 2, 4].forEach(v => {
      el('line', { class: 'grid-l', x1: m.l, x2: W - m.r, y1: Y1(v), y2: Y1(v) }, svg);
      el('text', { class: 'axis-t', x: m.l - 6, y: Y1(v) + 3, 'text-anchor': 'end' }, svg).textContent = v;
    });
    for (let v = 0; v <= smax; v += 5) {
      el('line', { class: 'grid-l', x1: m.l, x2: W - m.r, y1: Y2(v), y2: Y2(v) }, svg);
      el('text', { class: 'axis-t', x: m.l - 6, y: Y2(v) + 3, 'text-anchor': 'end' }, svg).textContent = v;
    }
    const step = W < 420 ? 50 : 25;
    for (let n = 0; n < N; n += step) {
      el('text', { class: 'axis-t', x: X(n), y: Ht - 6, 'text-anchor': 'middle' }, svg).textContent = n;
    }
    el('text', { class: 'lab', x: m.l, y: m.t - 5 }, svg).textContent = 'SIGNAL x[n]';
    el('text', { class: 'lab', x: m.l, y: top2 - 6 }, svg).textContent = 'CUSUM STATISTIC S[n]';
    el('text', { class: 'axis-t', x: W - m.r, y: Ht - 6, 'text-anchor': 'end' }, svg).textContent = 'sample n →';

    // panel 1: samples + mean levels
    const g1 = el('g', {}, svg);
    data.x.forEach((v, n) => el('circle', { class: 'sig', cx: X(n).toFixed(1), cy: Y1(v).toFixed(1), r: 1.7 }, g1));
    el('path', { class: 'mean', d: `M${X(0)},${Y1(0)}H${X(CHANGE)}M${X(CHANGE)},${Y1(SHIFT)}H${X(N - 1)}` }, svg);

    // change point (both panels)
    el('line', { class: 'chg', x1: X(CHANGE), x2: X(CHANGE), y1: m.t, y2: top2 + h2 }, svg);
    el('text', { class: 'lab lab-p', x: X(CHANGE) - 5, y: m.t + 8, 'text-anchor': 'end' }, svg).textContent = 'CHANGE';

    // panel 2: threshold, statistic, alarm
    el('line', { class: 'thr', x1: m.l, x2: W - m.r, y1: Y2(H), y2: Y2(H) }, svg);
    el('text', { class: 'lab', x: m.l + 4, y: Y2(H) - 5 }, svg).textContent = `THRESHOLD h = ${H}`;
    const d = data.s.map((v, n) => `${n ? 'L' : 'M'}${X(n).toFixed(1)},${Y2(v).toFixed(1)}`).join('');
    const p = el('path', { class: 'stat', d }, svg);
    const len = Math.ceil(p.getTotalLength?.() || 2000);
    p.style.setProperty('--len', len);
    el('line', { class: 'alarm', x1: X(data.alarm), x2: X(data.alarm), y1: Y2(data.s[data.alarm]), y2: top2 + h2 }, svg);
    el('circle', { class: 'alarm-dot', cx: X(data.alarm), cy: Y2(data.s[data.alarm]), r: 5 }, svg);
    const al = el('text', { class: 'lab', x: X(data.alarm) + 7, y: Y2(data.s[data.alarm]) + 4 }, svg);
    al.textContent = `ALARM, n = ${data.alarm}`;
    if (X(data.alarm) + 110 > W) { al.setAttribute('x', X(data.alarm) - 8); al.setAttribute('text-anchor', 'end'); }

    // crosshair
    const xg = el('g', {}, svg);
    const xh = el('line', { class: 'xh', y1: m.t, y2: top2 + h2 }, xg);
    const d1 = el('circle', { class: 'xh-dot', r: 3.5 }, xg);
    const d2 = el('circle', { class: 'xh-dot', r: 4 }, xg);
    const hit = el('rect', { x: m.l, y: 0, width: iw, height: Ht, fill: 'transparent' }, svg);

    const show = n => {
      state.n = n;
      xg.classList.toggle('on', n >= 0);
      if (n < 0) { tip.hidden = true; return; }
      xh.setAttribute('x1', X(n)); xh.setAttribute('x2', X(n));
      d1.setAttribute('cx', X(n)); d1.setAttribute('cy', Y1(data.x[n]));
      d2.setAttribute('cx', X(n)); d2.setAttribute('cy', Y2(data.s[n]));
      tip.textContent = `n = ${n}   x = ${data.x[n].toFixed(2)}   S = ${data.s[n].toFixed(2)}${n >= data.alarm ? '   ⚑ alarm' : ''}`;
      tip.hidden = false;
      const scale = host.clientWidth / W;
      tip.style.left = `${Math.min(Math.max(X(n) * scale, 90), host.clientWidth - 90)}px`;
      tip.style.top = `${host.offsetTop + Y2(data.s[n]) * scale}px`;
    };
    const fromEvent = e => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (W / r.width);
      return Math.round(Math.min(N - 1, Math.max(0, (px - m.l) / iw * (N - 1))));
    };
    hit.addEventListener('pointermove', e => show(fromEvent(e)));
    hit.addEventListener('pointerleave', () => show(-1));
    host.tabIndex = 0;
    host.onkeydown = e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = state.n < 0 ? CHANGE : state.n + (e.key === 'ArrowRight' ? 1 : -1);
        show(Math.min(N - 1, Math.max(0, n)));
      }
    };
    host.onblur = () => show(-1);
  };

  render();
  let w = host.clientWidth;
  new ResizeObserver(() => { if (host.clientWidth !== w) { w = host.clientWidth; render(); } }).observe(host);
}
