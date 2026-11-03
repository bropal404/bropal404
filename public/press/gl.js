// The press: one fixed, click-through WebGL canvas that
//   1. re-prints every [data-ht] photo as a newsprint halftone (dots "develop" on first view),
//   2. turns the cursor into a printer's loupe that magnifies the CMYK rosette underneath,
//   3. fires shredded-newspaper confetti on demand.
// Works in CSS pixels with an orthographic camera, so a mesh = a DOM rect.

import * as THREE from 'three';

const root = document.documentElement;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ───────────── shaders ───────────── */
const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D uMap;
  uniform vec2  uSize;     // element size, CSS px
  uniform vec2  uImg;      // image natural size
  uniform vec2  uMouse;    // pointer in element px (y down)
  uniform float uLens;     // 0..1 loupe strength
  uniform float uLensR;    // loupe radius, px
  uniform float uCell;     // halftone pitch, px
  uniform float uReveal;   // 0..1 "developing"
  uniform float uGain;     // dot gain from scroll speed
  uniform float uNight;    // 0 morning, 1 night
  uniform float uRound;    // 1 = circular crop
  uniform float uTexScale; // texels per CSS px (for mip choice)
  uniform vec3  uPaper;
  uniform vec3  uInk;
  varying vec2 vUv;

  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec2 coverUv(vec2 px) {
    vec2 uv = vec2(px.x / uSize.x, 1.0 - px.y / uSize.y);
    float ra = uSize.x / uSize.y, ia = uImg.x / uImg.y;
    vec2 s = ra > ia ? vec2(1.0, ia / ra) : vec2(ra / ia, 1.0);
    return (uv - 0.5) * s + 0.5;
  }
  vec3 img(vec2 px, float lod) { return textureLod(uMap, coverUv(px), lod).rgb; }

  // One screen: returns (coverage, sampled colour) for the dot under px.
  // val selects the channel that drives the dot.
  vec4 screenAt(vec2 px, float ang, float cell, float lod) {
    vec2 p = rot(ang) * px / cell;
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    vec2 cpx = rot(-ang) * ((id + 0.5) * cell);
    vec3 c = img(cpx, lod);
    return vec4(c, length(f) + (hash(id) - 0.5) * 0.035);
  }
  float dotCov(float v, float d, float cell, vec2 id) {
    float r = sqrt(clamp(v, 0.0, 1.0)) * 0.72 * (1.0 + uGain);
    float aa = 1.2 / cell;
    return 1.0 - smoothstep(r - aa, r + aa, d);
  }

  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main() {
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uSize;
    float lod = max(0.0, log2(uCell * uTexScale) - 0.5);

    /* ---- base: mono halftone at 45° ---- */
    vec2 p = rot(0.785398) * px / uCell;
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    vec2 cpx = rot(-0.785398) * ((id + 0.5) * uCell);
    float L = lum(img(cpx, lod));
    L = clamp((L - 0.5) * 1.18 + 0.52, 0.0, 1.0);
    float v = mix(1.0 - L, L, uNight);
    // develop: each dot appears at its own moment
    float grow = smoothstep(0.0, 1.0, uReveal * 1.7 - hash(id) * 0.7);
    float d = length(f) + (hash(id + 3.1) - 0.5) * 0.04;
    float cov = dotCov(v * grow, d, uCell, id);
    vec3 col = mix(uPaper, uInk, cov);

    /* ---- printer's loupe: magnified CMYK (or RGB at night) ---- */
    float dm = distance(px, uMouse);
    float R = uLensR * uLens;
    if (uLens > 0.001 && dm < R + 16.0) {
      float zoom = 2.4;
      vec2 q = uMouse + (px - uMouse) / zoom;   // image-space point seen through the glass
      float cell = uCell * 0.85;
      float llod = max(0.0, log2(cell * uTexScale) - 0.5);
      vec3 lens;
      if (uNight < 0.5) {
        vec4 sC = screenAt(q, 0.2618, cell, llod);
        vec4 sM = screenAt(q, 1.309, cell, llod);
        vec4 sY = screenAt(q, 0.0, cell, llod);
        vec4 sK = screenAt(q, 0.785398, cell, llod);
        // naive RGB -> CMYK per sampled cell
        float kC = 1.0 - max(max(sC.r, sC.g), sC.b), kM = 1.0 - max(max(sM.r, sM.g), sM.b);
        float kY = 1.0 - max(max(sY.r, sY.g), sY.b), kK = 1.0 - max(max(sK.r, sK.g), sK.b);
        float c = (1.0 - sC.r - kC) / max(1e-3, 1.0 - kC);
        float m = (1.0 - sM.g - kM) / max(1e-3, 1.0 - kM);
        float y = (1.0 - sY.b - kY) / max(1e-3, 1.0 - kY);
        float k = kK * 0.9;
        float aa = 1.2 / (cell * zoom);
        float rC = sqrt(clamp(c, 0.0, 1.0)) * 0.7, rM = sqrt(clamp(m, 0.0, 1.0)) * 0.7;
        float rY = sqrt(clamp(y, 0.0, 1.0)) * 0.7, rK = sqrt(clamp(k, 0.0, 1.0)) * 0.7;
        float cC = 1.0 - smoothstep(rC - aa, rC + aa, sC.a);
        float cM = 1.0 - smoothstep(rM - aa, rM + aa, sM.a);
        float cY = 1.0 - smoothstep(rY - aa, rY + aa, sY.a);
        float cK = 1.0 - smoothstep(rK - aa, rK + aa, sK.a);
        vec3 paper = vec3(0.95, 0.945, 0.92);
        lens = paper;
        lens *= mix(vec3(1.0), vec3(0.0, 0.63, 0.89), cC);
        lens *= mix(vec3(1.0), vec3(0.90, 0.0, 0.49), cM);
        lens *= mix(vec3(1.0), vec3(1.0, 0.93, 0.0), cY);
        lens *= mix(vec3(1.0), vec3(0.07), cK);
      } else {
        // night edition: it's a screen, so show RGB phosphor dots
        vec4 sR = screenAt(q, 0.2618, cell, llod);
        vec4 sG = screenAt(q, 1.309, cell, llod);
        vec4 sB = screenAt(q, 0.0, cell, llod);
        float aa = 1.2 / (cell * zoom);
        float cR = 1.0 - smoothstep(sqrt(sR.r) * 0.62 - aa, sqrt(sR.r) * 0.62 + aa, sR.a);
        float cG = 1.0 - smoothstep(sqrt(sG.g) * 0.62 - aa, sqrt(sG.g) * 0.62 + aa, sG.a);
        float cB = 1.0 - smoothstep(sqrt(sB.b) * 0.62 - aa, sqrt(sB.b) * 0.62 + aa, sB.a);
        lens = vec3(0.03) + vec3(1.0, 0.18, 0.2) * cR + vec3(0.2, 1.0, 0.35) * cG + vec3(0.25, 0.4, 1.0) * cB;
      }
      // glass: slight vignette inside, ink ring, soft shadow outside
      float inside = 1.0 - smoothstep(R - 1.0, R + 0.5, dm);
      lens *= 1.0 - 0.18 * smoothstep(R * 0.6, R, dm);
      col = mix(col, lens, inside);
      float ring = smoothstep(R - 3.5, R - 2.0, dm) * (1.0 - smoothstep(R + 0.5, R + 2.0, dm));
      col = mix(col, uInk, ring);
      float shadow = smoothstep(R + 14.0, R, dm) * step(R + 1.5, dm) * 0.22;
      col = mix(col, vec3(0.0), shadow);
      // crosshair tick in the middle of the glass
      vec2 o = abs(px - uMouse);
      float cross = step(o.x, 0.6) * step(o.y, 6.0) + step(o.y, 0.6) * step(o.x, 6.0);
      col = mix(col, uInk, clamp(cross, 0.0, 1.0) * inside * 0.8);
    }

    // newsprint fibre
    col *= 1.0 - (hash(floor(px * 1.5)) - 0.5) * 0.05;

    float alpha = 1.0;
    if (uRound > 0.5) {
      float rr = min(uSize.x, uSize.y) * 0.5;
      alpha = 1.0 - smoothstep(rr - 1.0, rr, distance(px, uSize * 0.5));
    }
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

const CONFETTI_VERT = /* glsl */`
  attribute float aTile;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
    vShade = abs(n.z);
    vec2 tile = vec2(mod(aTile, 4.0), floor(aTile / 4.0));
    vUv = (uv + tile) / 4.0;
    gl_Position = projectionMatrix * modelViewMatrix * wp;
  }
`;
const CONFETTI_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vec3 c = texture2D(uAtlas, vUv).rgb;
    gl_FragColor = vec4(c * (0.55 + 0.45 * vShade), 1.0);
  }
`;

/* ───────────── helpers ───────────── */
function cssColor(name) {
  const v = getComputedStyle(root).getPropertyValue(name).trim();
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (!m) return new THREE.Vector3(0.9, 0.9, 0.88);
  const n = parseInt(m[1], 16);
  // kept in sRGB on purpose: the shader outputs sRGB directly
  return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255);
}
const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/* ───────────── main ───────────── */
export async function initPress() {
  const canvas = document.getElementById('press');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  } catch (e) {
    throw new Error('WebGL unavailable');
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.right = innerWidth; camera.bottom = -innerHeight;
    camera.updateProjectionMatrix();
    dirty = true;
  };

  const colors = { paper: cssColor('--paper'), ink: cssColor('--ink'), night: root.dataset.theme === 'night' ? 1 : 0 };

  /* ---- halftone planes ---- */
  const geo = new THREE.PlaneGeometry(1, 1);
  const plates = [];
  // photos "develop" and the loupe works only once the intro has gone
  const gateOpen = () => !root.classList.contains('intro');
  let dirty = true;

  function addPlate(frame) {
    const img = frame.querySelector('img');
    if (!img) return;
    const plate = { frame, img, mesh: null, mat: null, revealStart: -1, lens: 0, visible: false, ready: false };
    plates.push(plate);
    const build = () => {
      if (plate.ready || !img.naturalWidth) return;
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.NoColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 1;
      tex.needsUpdate = true;
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uMap: { value: tex },
          uSize: { value: new THREE.Vector2(1, 1) },
          uImg: { value: new THREE.Vector2(img.naturalWidth, img.naturalHeight) },
          uMouse: { value: new THREE.Vector2(-9999, -9999) },
          uLens: { value: 0 },
          uLensR: { value: 84 },
          uCell: { value: 6 },
          uReveal: { value: RM ? 1 : 0 },
          uGain: { value: 0 },
          uNight: { value: colors.night },
          uRound: { value: frame.classList.contains('mug') ? 1 : 0 },
          uTexScale: { value: 1 },
          uPaper: { value: colors.paper },
          uInk: { value: colors.ink },
        },
      });
      // premultiplied output
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneMinusSrcAlphaFactor;
      plate.mat = mat;
      plate.mesh = new THREE.Mesh(geo, mat);
      plate.mesh.frustumCulled = false;
      plate.mesh.visible = false;
      scene.add(plate.mesh);
      plate.ready = true;
      plate.firstFrame = true;
      dirty = true;
    };
    if (img.complete && img.naturalWidth) build();
    else img.addEventListener('load', build, { once: true });
  }
  document.querySelectorAll('[data-ht]').forEach(addPlate);
  // lazy images only start loading near the viewport; nudge them so textures are ready early
  document.querySelectorAll('[data-ht] img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });

  /* ---- pointer / loupe ---- */
  const pointer = { x: -9999, y: -9999, kind: 'mouse', down: false, moved: false };
  addEventListener('pointermove', e => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.kind = e.pointerType; pointer.moved = true;
  }, { passive: true });
  addEventListener('pointerdown', e => {
    pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY; pointer.kind = e.pointerType; pointer.moved = true;
  }, { passive: true });
  const up = () => { pointer.down = false; pointer.moved = true; if (pointer.kind !== 'mouse') { pointer.x = pointer.y = -9999; } };
  addEventListener('pointerup', up, { passive: true });
  addEventListener('pointercancel', up, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.x = pointer.y = -9999; pointer.moved = true; });

  /* ---- scroll speed -> dot gain ---- */
  let lastY = scrollY, vel = 0, gain = 0;

  /* ---- theme ---- */
  addEventListener('kc:theme', () => {
    // wait one frame so the new custom properties are computed
    requestAnimationFrame(() => {
      colors.paper.copy(cssColor('--paper'));
      colors.ink.copy(cssColor('--ink'));
      colors.night = root.dataset.theme === 'night' ? 1 : 0;
      plates.forEach(p => { if (p.mat) p.mat.uniforms.uNight.value = colors.night; });
      buildAtlas();
      dirty = true;
    });
  });
  addEventListener('kc:intro-done', () => { dirty = true; });

  /* ───── confetti: shredded newspaper ───── */
  const MAX = 180;
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = atlasCanvas.height = 512;
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.colorSpace = THREE.NoColorSpace;
  const WORDS = ['EXTRA!', 'HIRED?', 'GO', 'epoll', 'TLS', 'KAFKA', 'LoRA', '11,000', '140ms', 'C', 'vim', 'NEWS',
    'PRESS', 'BREAKING', 'biriyani', 'SCOOP'];
  function buildAtlas() {
    const g = atlasCanvas.getContext('2d');
    const P = `rgb(${colors.paper.toArray().map(v => Math.round(v * 255)).join(',')})`;
    const I = `rgb(${colors.ink.toArray().map(v => Math.round(v * 255)).join(',')})`;
    const B = getComputedStyle(root).getPropertyValue('--pencil').trim() || '#2B40D9';
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * 128, y = Math.floor(i / 4) * 128;
      const style = i % 5;
      const bg = style === 3 ? I : style === 4 ? B : P;
      const fg = style === 3 || style === 4 ? P : I;
      g.fillStyle = bg; g.fillRect(x, y, 128, 128);
      g.fillStyle = fg;
      if (i % 3 === 0) {
        g.font = `800 ${34 + (i % 4) * 4}px Newsreader, Georgia, serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(WORDS[i], x + 64, y + 50, 120);
        for (let l = 0; l < 3; l++) g.fillRect(x + 10, y + 82 + l * 12, 108 - (l * 23) % 40, 5);
      } else if (i % 3 === 1) {
        for (let l = 0; l < 9; l++) g.fillRect(x + 8, y + 10 + l * 13, 112 - ((l * 37 + i * 11) % 46), 5);
      } else {
        for (let yy = 6; yy < 128; yy += 10) for (let xx = 6; xx < 128; xx += 10) {
          const r = 1 + 3.6 * Math.abs(Math.sin((xx + i * 13) * .05) * Math.cos((yy + i * 7) * .045));
          g.beginPath(); g.arc(x + xx, y + yy, r, 0, Math.PI * 2); g.fill();
        }
      }
    }
    atlas.needsUpdate = true;
  }
  buildAtlas();

  const cGeo = new THREE.PlaneGeometry(1, 1);
  const tiles = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) tiles[i] = Math.floor(Math.random() * 16);
  cGeo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 1));
  const cMat = new THREE.ShaderMaterial({
    vertexShader: CONFETTI_VERT, fragmentShader: CONFETTI_FRAG,
    uniforms: { uAtlas: { value: atlas } }, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    transparent: true, // same render list as the plates, so renderOrder puts it on top
  });
  const confetti = new THREE.InstancedMesh(cGeo, cMat, MAX);
  confetti.frustumCulled = false;
  confetti.count = 0;
  confetti.renderOrder = 10;
  scene.add(confetti);
  const bits = [];
  const dummy = new THREE.Object3D();

  function burst(x, y) {
    const n = RM ? 40 : MAX;
    bits.length = 0;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.15;
      const sp = 520 + Math.random() * 980;
      bits.push({
        x: x + (Math.random() - .5) * 60, y: -y + (Math.random() - .5) * 20, z: 0,
        vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp,
        w: 16 + Math.random() * 26, h: 11 + Math.random() * 18,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        axis: new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize(),
        spin: 4 + Math.random() * 10,
        phase: Math.random() * 6.28,
        sway: 30 + Math.random() * 70,
      });
    }
    confetti.count = n;
    dirty = true;
  }

  /* ───── loop ───── */
  const clock = new THREE.Clock();
  let lastKey = '';
  const tmpQ = new THREE.Quaternion();

  function frame() {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    const now = clock.elapsedTime;

    // scroll velocity -> ink gain (a little smear when you fling the page)
    const sy = scrollY;
    vel = vel * .85 + ((sy - lastY) / Math.max(dt, 1e-3)) * .15;
    lastY = sy;
    const g = RM ? 0 : Math.min(Math.abs(vel) / 6000, .22);
    if (Math.abs(g - gain) > .002) { gain += (g - gain) * .25; dirty = true; }

    let key = '';
    const gate = gateOpen();
    for (const p of plates) {
      if (!p.ready) continue;
      const r = p.frame.getBoundingClientRect();
      const vis = r.bottom > 0 && r.top < innerHeight && r.width > 0;
      p.mesh.visible = vis;
      if (!vis) continue;
      key += `${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0};`;
      const u = p.mat.uniforms;
      p.mesh.position.set(r.left + r.width / 2, -(r.top + r.height / 2), 0);
      p.mesh.scale.set(r.width, r.height, 1);
      u.uSize.value.set(r.width, r.height);
      const cellAttr = parseFloat(p.frame.dataset.cell);
      u.uCell.value = cellAttr || Math.min(7, Math.max(4.2, r.width / 120));
      // texels per CSS px under object-fit: cover
      u.uTexScale.value = (u.uImg.value.x / r.width) * Math.min(1, (r.width / r.height) / (u.uImg.value.x / u.uImg.value.y));
      u.uLensR.value = Math.min(92, Math.max(48, Math.min(r.width, r.height) * .3));
      u.uGain.value = gain;

      // develop on first sight (after the intro)
      if (gate && p.revealStart < 0) p.revealStart = now;
      const rv = p.revealStart < 0 ? 0 : (RM ? 1 : easeOut((now - p.revealStart) / 1.6));
      if (u.uReveal.value !== rv) { u.uReveal.value = rv; dirty = true; }

      // loupe
      const inside = pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom
        && (pointer.kind === 'mouse' || pointer.kind === 'pen' || pointer.down);
      const target = inside && gate ? 1 : 0;
      const nl = p.lens + (target - p.lens) * Math.min(1, dt * 12);
      p.lens = Math.abs(nl - target) < .002 ? target : nl;
      if (p.lens !== u.uLens.value) { u.uLens.value = p.lens; dirty = true; }
      if (p.lens > 0 && pointer.moved) dirty = true;
      u.uMouse.value.set(pointer.x - r.left, pointer.y - r.top);

      if (p.firstFrame) { p.firstFrame = false; p.frame.classList.add('gl-ready'); dirty = true; }
    }
    if (key !== lastKey) { lastKey = key; dirty = true; }
    pointer.moved = false;

    // confetti physics
    if (confetti.count > 0) {
      let alive = 0;
      for (let i = 0; i < confetti.count; i++) {
        const b = bits[i];
        b.vy -= 1500 * dt;
        const drag = Math.exp(-2.2 * dt);
        b.vx *= drag; b.vy *= drag;
        b.vy = Math.max(b.vy, -260);         // paper has a low terminal velocity
        b.x += (b.vx + Math.sin(now * 3 + b.phase) * b.sway) * dt;
        b.y += b.vy * dt;
        tmpQ.setFromAxisAngle(b.axis, b.spin * dt);
        b.q.multiply(tmpQ);
        dummy.position.set(b.x, b.y, 0);
        dummy.quaternion.copy(b.q);
        dummy.scale.set(b.w, b.h, 1);
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
        if (b.y > -innerHeight - 60) alive++;
      }
      confetti.instanceMatrix.needsUpdate = true;
      if (!alive) confetti.count = 0;
      dirty = true;
    }

    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return { burst };
}
