// "Spinning newspaper" intro, in the tradition of every 1940s newsreel montage.
// A front page is drawn on a 2D canvas, mapped onto a gently curved sheet of paper,
// spun in from the dark, slammed flat, and then the camera dives into the headline.

import * as THREE from 'three';

const PAPER = '#E9E8E2', INK = '#121213';
const W = 1024, H = 1448;

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fontsReady() {
  const faces = ['110px "UnifrakturMaguntia"', '200px "Anton"', 'italic 40px "Newsreader"', '800 40px "Newsreader"', '20px "Courier Prime"', '28px "Tiro Devanagari Hindi"'];
  try { await Promise.race([Promise.all(faces.map(f => document.fonts.load(f))), wait(1600)]); } catch (e) {}
}

function loadImage(src) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

function fit(g, text, font, maxW) {
  // shrink a font string's size until the text fits maxW
  let size = parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]);
  const f = s => font.replace(/\d+(\.\d+)?px/, `${s}px`);
  g.font = f(size);
  while (g.measureText(text).width > maxW && size > 8) { size -= 2; g.font = f(size); }
  return size;
}

async function frontPage() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // paper + speckle
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * .05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
  }
  g.fillStyle = INK; g.strokeStyle = INK;
  const M = 56;

  // ears
  g.lineWidth = 2;
  g.strokeRect(M, 40, 150, 92); g.strokeRect(W - M - 150, 40, 150, 92);
  g.font = '700 15px "Courier Prime", monospace'; g.textAlign = 'center';
  g.fillText('WEATHER', M + 75, 70); g.fillText('PRICE', W - M - 75, 70);
  g.font = 'italic 21px "Newsreader", Georgia, serif';
  g.fillText('Biriyani', M + 75, 100); g.fillText('likely', M + 75, 122);
  g.fillText('One (1)', W - M - 75, 100); g.fillText('biriyani', W - M - 75, 122);

  // nameplate
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  fit(g, 'The Kataria Chronicle', '400 92px "UnifrakturMaguntia", serif', W - 2 * M - 330);
  g.fillText('The Kataria Chronicle', W / 2, 118);
  g.font = 'italic 21px "Newsreader", Georgia, serif';
  g.fillText('“All the commits that are fit to push”', W / 2, 152);

  // rules + dateline
  g.fillRect(M, 172, W - 2 * M, 5); g.fillRect(M, 181, W - 2 * M, 1.5);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  g.font = '700 17px "Courier Prime", monospace';
  g.textAlign = 'left'; g.fillText('NO. 404', M, 206);
  g.textAlign = 'center'; g.fillText(`HYDERABAD · ${date.toUpperCase()}`, W / 2, 206);
  g.textAlign = 'right'; g.fillText('LATE EDITION', W - M, 206);
  g.fillRect(M, 218, W - 2 * M, 1.5);

  // EXTRA!
  g.textAlign = 'center';
  fit(g, 'EXTRA!', '400 250px "Anton", Impact, sans-serif', W - 2 * M);
  g.fillText('EXTRA!', W / 2, 470);
  fit(g, 'PORTFOLIO GOES', '400 128px "Anton", Impact, sans-serif', W - 2 * M);
  g.fillText('PORTFOLIO GOES', W / 2, 610);
  fit(g, 'TO PRESS', '400 128px "Anton", Impact, sans-serif', W - 2 * M);
  g.fillText('TO PRESS', W / 2, 745);
  g.font = 'italic 34px "Newsreader", Georgia, serif';
  g.fillText('Gopal Kataria’s new site hits the stands;', W / 2, 808);
  g.fillText('readers advised to scroll', W / 2, 848);
  g.fillRect(M, 880, W - 2 * M, 2);

  // halftone photo block, printed from the lead portrait
  const px = M, py = 906, pw = 400, ph = 470;
  g.fillStyle = '#d9d8d1'; g.fillRect(px, py, pw, ph);
  const im = await loadImage('img/portrait.jpg');
  g.fillStyle = INK;
  if (im) {
    const sc = document.createElement('canvas');
    const cell = 9, cols = Math.ceil(pw / cell), rows = Math.ceil(ph / cell);
    sc.width = cols; sc.height = rows;
    const sg = sc.getContext('2d');
    const ia = im.width / im.height, ba = pw / ph;
    let sw = im.width, sh = im.height, sx = 0, sy = 0;
    if (ia > ba) { sw = im.height * ba; sx = (im.width - sw) / 2; } else { sh = im.width / ba; sy = (im.height - sh) / 2; }
    sg.drawImage(im, sx, sy, sw, sh, 0, 0, cols, rows);
    const d = sg.getImageData(0, 0, cols, rows).data;
    g.save(); g.beginPath(); g.rect(px, py, pw, ph); g.clip();
    g.fillStyle = PAPER; g.fillRect(px, py, pw, ph); g.fillStyle = INK;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const L = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255;
      const r = Math.sqrt(Math.max(0, 1 - L * 1.05)) * cell * .62;
      if (r < .4) continue;
      g.beginPath(); g.arc(px + x * cell + cell / 2 + (y % 2) * cell / 2, py + y * cell + cell / 2, r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  g.lineWidth = 2; g.strokeRect(px, py, pw, ph);
  g.font = 'italic 17px "Newsreader", Georgia, serif'; g.textAlign = 'left';
  g.fillText('ARTIST’S IMPRESSION of the subject, c. 1930.', px, py + ph + 26);

  // columns of copy
  const cx0 = px + pw + 34, colW = (W - M - cx0 - 24) / 2;
  for (let col = 0; col < 2; col++) {
    const x0 = cx0 + col * (colW + 24);
    g.font = '800 30px "Newsreader", Georgia, serif';
    if (col === 0) {
      g.fillText('Engineer ships', x0, py + 26);
      g.fillText('systems that', x0, py + 60);
      g.fillText('stay up', x0, py + 94);
    } else {
      g.fillText('Model learns', x0, py + 26);
      g.fillText('to speak', x0, py + 60);
      g.fillText('Hinglish', x0, py + 94);
    }
    for (let l = 0; l < 26; l++) {
      const w = colW - ((l * 37 + col * 19) % 5 === 0 ? 40 + (l * 13) % 50 : (l * 7) % 12);
      g.fillStyle = 'rgba(18,18,19,.62)';
      g.fillRect(x0, py + 122 + l * 17.5, w, 7);
    }
    g.fillStyle = INK;
    if (col === 0) g.fillRect(x0 + colW + 11, py, 1.5, ph + 30);
  }
  g.fillRect(M, H - 46, W - 2 * M, 2);
  g.font = '700 15px "Courier Prime", monospace'; g.textAlign = 'center';
  g.fillText('PRINTED IN HYDERABAD WITH THREE.JS ON RECYCLED PIXELS', W / 2, H - 20);
  return c;
}

export async function playIntro({ fadeOut }) {
  const wrap = document.getElementById('intro');
  // fresh canvas every run: the previous run deliberately lost its WebGL context
  const old = document.getElementById('intro-canvas');
  const canvas = old.cloneNode(false);
  old.replaceWith(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  await fontsReady();
  const tex = new THREE.CanvasTexture(await frontPage());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 400);

  // a sheet of newsprint with a soft curl
  const sw = 3.4, sh = sw * H / W;
  const geo = new THREE.PlaneGeometry(sw, sh, 40, 56);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const nx = x / (sw / 2), ny = y / (sh / 2);
    pos.setZ(i, -.1 * nx * nx + .05 * Math.sin(ny * 2.2) + .08 * Math.max(0, nx + ny - 1.2) ** 2);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .92, metalness: 0, side: THREE.DoubleSide });
  const sheet = new THREE.Mesh(geo, mat);
  scene.add(sheet);

  scene.add(new THREE.AmbientLight(0xffffff, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-2.5, 3, 6);
  scene.add(key);

  let dist = 10;
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    dist = Math.max((sh / 2) / t, (sw / 2) / (t * camera.aspect)) * 1.18;
    camera.updateProjectionMatrix();
  };
  resize();

  // timeline (seconds)
  const SPIN = 1.0, THUD = .2, HOLD = .2, DIVE = .6, FADE_AT = SPIN + THUD + HOLD + .2;
  const END = SPIN + THUD + HOLD + DIVE;
  let t = 0, last = performance.now(), faded = false, skip = false;
  const doSkip = () => { if (!skip) { skip = true; t = Math.max(t, FADE_AT); } };
  const ac = new AbortController();
  const opt = { passive: true, signal: ac.signal };
  wrap.addEventListener('click', doSkip, opt);
  addEventListener('keydown', doSkip, opt);
  addEventListener('wheel', doSkip, opt);
  addEventListener('touchstart', doSkip, opt);
  addEventListener('resize', resize, opt);

  const ease = x => 1 - Math.pow(1 - x, 3);
  await new Promise(resolve => {
    const loop = now => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      t += dt * (skip ? 2.2 : 1);

      // spin in from the dark
      const p = ease(Math.min(1, t / SPIN));
      sheet.rotation.z = (1 - p) * Math.PI * 7 - (1 - p) * .2;
      sheet.rotation.x = (1 - p) * .9 * Math.sin(t * 5);
      sheet.rotation.y = (1 - p) * .5 * Math.cos(t * 4);
      sheet.position.z = THREE.MathUtils.lerp(-70, 0, p);
      sheet.scale.setScalar(.25 + .75 * p);

      // thud: a little camera shake when it lands
      let shake = 0;
      if (t > SPIN && t < SPIN + THUD) shake = (1 - (t - SPIN) / THUD) * .05;
      // dive into the headline
      const dv = Math.max(0, Math.min(1, (t - SPIN - THUD - HOLD) / DIVE));
      const d = dv * dv * (3 - 2 * dv);
      camera.position.set(
        (Math.random() - .5) * shake,
        THREE.MathUtils.lerp(0, sh * .2, d) + (Math.random() - .5) * shake,
        THREE.MathUtils.lerp(dist, dist * .22, d),
      );
      camera.lookAt(0, THREE.MathUtils.lerp(0, sh * .2, d), 0);

      if (!faded && t >= FADE_AT) { faded = true; fadeOut(); }
      renderer.render(scene, camera);
      if (t < END) requestAnimationFrame(loop);
      else setTimeout(resolve, 260);
    };
    requestAnimationFrame(loop);
  });

  ac.abort();
  geo.dispose(); mat.dispose(); tex.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}
