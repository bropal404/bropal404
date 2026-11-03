// The Kataria Chronicle — page behaviour.
// Everything here is progressive enhancement: the page reads fine without it.

import { drawFigure } from './figure.js';
import { initEggs } from './eggs.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TZ = 'Asia/Kolkata';

/* ───────────── dateline: date, live IST clock, volume ───────────── */
function roman(n) {
  const t = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s || 'I';
}
function dateline() {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: 'numeric' })
    .formatToParts(now).map(p => [p.type, +p.value]));
  // Volume = year of study at IIIT-H (joined July 2023)
  const vol = parts.year - 2023 + (parts.month >= 7 ? 1 : 0);
  $('#vol').textContent = `Vol. ${roman(Math.max(1, vol))}`;
  $('#year').textContent = parts.year;
  $('#today').textContent = 'Hyderabad, ' + new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(now);
  const tick = () => {
    $('#clock').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
      .format(new Date()) + ' IST';
  };
  tick();
  setInterval(tick, 20_000);
}

/* ───────────── edition (theme) switch ───────────── */
function setEditionLabel() {
  const night = root.dataset.theme === 'night';
  const btn = $('#edition');
  btn.setAttribute('aria-pressed', String(night));
  $('.ed-ico', btn).textContent = night ? '☾' : '☀';
  $('.ed-label', btn).textContent = night ? 'Night Edition' : 'Morning Edition';
  $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', night ? '#131415' : '#E4E3DD'));
}
function edition() {
  setEditionLabel();
  $('#edition').addEventListener('click', () => {
    const next = root.dataset.theme === 'night' ? 'morning' : 'night';
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem('kc-theme', next); } catch (e) {}
      setEditionLabel();
      window.dispatchEvent(new CustomEvent('kc:theme'));
    };
    if (document.startViewTransition && !RM) document.startViewTransition(apply);
    else apply();
  });
}

/* ───────────── ticker ───────────── */
const MARKET = [
  ['Python', '+4.20', 1], ['C', '+1.90', 1], ['Go', '+2.70', 1], ['TypeScript', '+0.80', 1],
  ['Bash', '+6.60', 1], ['SQL', '+1.10', 1], ['vim', '+∞', 1], 
  ['Desktop environments', '−99.9', 0], ['Docker', '+5.00', 1], ['Kafka', '+2.25', 1],
  ['Biriyani', '+12.0', 1], ['Downtime', '−100', 0],
];
function ticker(extra = []) {
  const track = $('#ticker');
  const items = [...extra, ...MARKET].map(([k, v, up]) =>
    `<span class="${up ? 'up' : 'dn'}">${esc(k)} <i>${up ? '▲' : '▼'} ${esc(v)}</i></span>`).join('');
  track.innerHTML = items + items; // doubled for a seamless loop
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ───────────── live data (all optional) ───────────── */
async function getJSON(url, { text = false, ms = 7000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(r.status);
    return text ? await r.text() : await r.json();
  } finally { clearTimeout(t); }
}

const WMO = [
  [[0], 'Clear', 'Clear skies. Ideal biriyani conditions.'],
  [[1, 2], 'Partly cloudy', 'Some clouds. None of them AWS.'],
  [[3], 'Overcast', 'Overcast. Servers report no clouds of their own.'],
  [[45, 48], 'Fog', 'Fog. Visibility lower than a race condition.'],
  [[51, 53, 55, 56, 57], 'Drizzle', 'Drizzle. Chai recommended.'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain', 'Rain. Stay in, push code.'],
  [[71, 73, 75, 77, 85, 86], 'Snow', 'Snow in Hyderabad. Check your sensors.'],
  [[95, 96, 99], 'Thunderstorm', 'Thunderstorms. Commit early.'],
];
async function weather() {
  try {
    const d = await getJSON('https://api.open-meteo.com/v1/forecast?latitude=17.445&longitude=78.349&current=temperature_2m,weather_code&timezone=Asia%2FKolkata');
    const c = d.current;
    const w = WMO.find(([codes]) => codes.includes(c.weather_code)) || [null, 'Fair', 'Forecast: biriyani by evening.'];
    $('#wx-temp').textContent = `Hyderabad ${Math.round(c.temperature_2m)}°C · ${w[1]}`;
    $('#wx-desc').textContent = w[2];
  } catch (e) { /* keep the static forecast */ }
}

function ago(iso) {
  const s = (new Date(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [u, n] of [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  }
  return 'just now';
}

// The profile README is regenerated hourly by scripts/refresh_readme.py; reuse its JSON.
async function readme() {
  try {
    const md = await getJSON('https://raw.githubusercontent.com/bropal404/bropal404/main/README.md', { text: true });
    const m = md.match(/```json\s*([\s\S]*?)```/);
    if (!m) return [];
    const d = JSON.parse(m[1]);
    const gh = d.github || {};
    if (d.status) $('#status').textContent = String(d.status).toLowerCase().replace(/^\w/, c => c.toUpperCase());
    if (gh.latest_active_repo && gh.last_commit) {
      const box = $('#late-news');
      const p = $('#late-news-text');
      p.textContent = 'Kataria last pushed to ';
      const a = document.createElement('a');
      a.href = `https://github.com/bropal404/${encodeURIComponent(gh.latest_active_repo)}`;
      a.target = '_blank'; a.rel = 'noopener';
      const b = document.createElement('b'); b.textContent = gh.latest_active_repo; a.append(b);
      p.append(a, `, ${ago(gh.last_commit)}. Sources say more commits are expected.`);
      box.hidden = false;
      $('#late').textContent = `Updated ${ago(d.updated?.replace(' IST', '+05:30').replace(' ', 'T') || gh.last_commit)}`;
    }
    const extra = [];
    if (gh.longest_streak) extra.push(['Longest streak', `${gh.longest_streak} d`, 1]);
    if (gh.latest_active_repo) extra.push([`Most active: ${gh.latest_active_repo}`, 'hot', 1]);
    return extra;
  } catch (e) { return []; }
}

async function circulation() {
  try {
    const d = await getJSON('/~gopal.kataria/cgi-bin/vistor-count.py', { ms: 5000 });
    if (d && d.visitor_count != null) {
      $('#circ').textContent = Number(d.visitor_count).toLocaleString('en-IN');
      $('#circ-wrap').hidden = false;
    }
  } catch (e) { /* only exists on researchweb */ }
}

/* ───────────── headline typesetting ───────────── */
function typeset() {
  $$('[data-set]').forEach(h => {
    const words = h.textContent.trim().split(/\s+/);
    h.setAttribute('aria-label', h.textContent.trim());
    h.textContent = '';
    words.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.style.setProperty('--i', i);
      s.setAttribute('aria-hidden', 'true');
      s.textContent = w;
      h.append(s, i < words.length - 1 ? ' ' : '');
    });
  });
}

/* ───────────── blue pencil marks ───────────── */
function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function scribble(w, h, seed) {
  const r = rng(seed);
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  const start = -2.2 + r() * .5, sweep = Math.PI * 2 * (1.1 + r() * .08), N = 56;
  let d = '', len = 0, px, py;
  for (let i = 0; i <= N; i++) {
    const t = start + sweep * i / N;
    const k = 1 + (r() - .5) * .035 + (i / N) * .07;
    const x = cx + Math.cos(t) * rx * k, y = cy + Math.sin(t) * ry * k * (1 + .06 * Math.sin(t * 3 + seed));
    d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    if (i) len += Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  return { d, len: Math.ceil(len) };
}
function pencils() {
  const NS = 'http://www.w3.org/2000/svg';
  $$('.pencil').forEach((el, i) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS(NS, 'path');
    svg.append(path);
    el.append(svg);
    if (el.dataset.note) {
      const n = document.createElement('span');
      n.className = 'pencil-note';
      n.setAttribute('aria-hidden', 'true');
      n.textContent = el.dataset.note;
      el.append(n);
    }
    el._seed = 7 + i * 13;
  });
  layoutPencils();
}
function layoutPencils() {
  $$('.pencil').forEach(el => {
    const svg = $('svg', el), path = $('path', svg);
    const w = svg.clientWidth || el.offsetWidth, h = svg.clientHeight || el.offsetHeight;
    if (!w || !h) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const { d, len } = scribble(w, h, el._seed);
    path.setAttribute('d', d);
    path.style.setProperty('--len', len);
    const note = $('.pencil-note', el);
    if (note) {
      const r = el.getBoundingClientRect();
      const right = r.left + r.width / 2 < innerWidth * .6;
      note.classList.toggle('right', right);
      note.classList.toggle('left', !right);
    }
  });
}

/* ───────────── reveal-on-view ───────────── */
let io;
function observe(selector) {
  io ??= new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      if (el.matches('[data-set]')) el.classList.add('is-set');
      if (el.matches('.pencil, .pencil-del, .chart')) el.classList.add('drawn');
      if (el.matches('.stamp')) el.classList.add('slam');
      io.unobserve(el);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: .2 });
  const watch = () => $$(selector).forEach(el => io.observe(el));
  if (root.classList.contains('intro')) window.addEventListener('kc:intro-done', watch, { once: true });
  else watch();
}

/* ───────────── section scrollspy ───────────── */
function scrollspy() {
  const links = new Map($$('.sections a').map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach(a => a.removeAttribute('aria-current'));
      links.get(e.target.id)?.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-15% 0px -80% 0px' });
  links.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
}

/* ───────────── puzzle answer flip ───────────── */
function puzzle() {
  const b = $('.answer');
  b?.addEventListener('click', () => b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true')));
}

/* ───────────── intro + WebGL press ───────────── */
let press = null; // { burst(x, y) } once gl.js loads

function endIntro() {
  try { sessionStorage.setItem('kc-intro', '1'); } catch (e) {}
  root.classList.remove('intro', 'intro-out');
  window.dispatchEvent(new CustomEvent('kc:intro-done'));
}

async function runIntro() {
  try {
    const { playIntro } = await import('./intro.js');
    await playIntro({
      fadeOut: () => root.classList.add('intro-out'),
    });
  } catch (e) {
    console.warn('[chronicle] intro skipped:', e);
  }
  endIntro();
}

function replayIntro(e) {
  e.preventDefault();
  if (RM || root.classList.contains('intro')) return;
  scrollTo({ top: 0, behavior: 'instant' });
  root.classList.add('intro');
  runIntro();
}

async function startPress() {
  try {
    const { initPress } = await import('./gl.js');
    press = await initPress();
  } catch (e) {
    console.warn('[chronicle] WebGL press unavailable, using plain photos:', e);
  }
}

/* ───────────── copy email + paper confetti ───────────── */
function copyEmail() {
  const btn = $('#copy-email'), out = $('#copied');
  const email = $('#email').textContent.trim();
  btn.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(email); ok = true; } catch (e) {
      const range = document.createRange(); range.selectNodeContents($('#email'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    }
    out.textContent = ok ? 'Copied! Extra! Extra!' : 'Selected. Press Ctrl/⌘+C.';
    const r = btn.getBoundingClientRect();
    press?.burst(r.left + r.width / 2, r.top + r.height / 2);
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { out.textContent = ''; }, 3200);
  });
}

/* ───────────── collapse long stories ───────────── */
function collapse() {
  $$('.story, .lead').forEach(a => {
    const body = $('.body', a);
    if (!body) return;
    const extra = $$('.body > p', a).length > 1 || $('.tags, .pull', a);
    if (!extra) return;
    a.classList.add('collapsed');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'read-more';
    b.setAttribute('aria-expanded', 'false');
    b.textContent = 'Read more ↓';
    b.addEventListener('click', () => {
      const open = a.classList.toggle('collapsed') === false;
      b.setAttribute('aria-expanded', String(open));
      b.textContent = open ? 'Show less ↑' : 'Read more ↓';
      layoutPencils();
    });
    body.after(b);
  });
}

/* ───────────── boot ───────────── */
dateline();
edition();
ticker();
typeset();
collapse();
puzzle();
copyEmail();
scrollspy();
$('#nameplate').addEventListener('click', replayIntro);

if (root.classList.contains('intro')) runIntro();

drawFigure($('#fig1'));
// headlines, stamp and chart must never wait on web fonts
observe('[data-set], .chart, .stamp, .pencil-del');
// pencil scribbles are measured around the text, so they wait for the real glyphs
document.fonts.ready.then(() => {
  pencils();
  observe('.pencil');
});
let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(layoutPencils, 150); });

startPress();
initEggs({ burst: (x, y) => press?.burst(x, y), edition: () => $('#edition').click() });
weather();
circulation();
readme().then(extra => { if (extra.length) ticker(extra); });
