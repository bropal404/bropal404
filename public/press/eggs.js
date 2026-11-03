// Easter eggs. Nothing here is required for the page to work.

const $ = (s, r = document) => r.querySelector(s);
const root = document.documentElement;

let toastEl, toastT;
function toast(msg, ms = 3200) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
}

export function initEggs({ burst, edition }) {
  const confetti = () => {
    for (let i = 0; i < 4; i++) setTimeout(() => burst?.(innerWidth * (.2 + .2 * i), innerHeight * .4), i * 150);
  };

  /* console message */
  console.log('%cThe Kataria Chronicle', 'font:700 22px Georgia,serif');
  console.log('Reading the source? Good. Say hello: github.com/bropal404\nTry the Konami code, or type "biriyani", "sudo", or press "?".');

  /* secret terminal edition (Konami) + typed commands */
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let ki = 0, typed = '';
  const COMMANDS = {
    biriyani: () => { toast('Forecast confirmed: biriyani. Opening the back page…'); setTimeout(() => { location.href = 'secret.html'; }, 1200); },
    sudo: () => toast('Error 403: kataria is not in the sudoers file. This incident will be reported. (To nobody.)', 5000),
    vim: () => toast('You are now in vim. Good luck leaving. (Just kidding. :q!)'),
  };

  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    ki = k === KONAMI[ki] ? ki + 1 : (k === KONAMI[0] ? 1 : 0);
    if (ki === KONAMI.length) {
      ki = 0;
      const on = root.dataset.mode !== 'terminal';
      if (on) root.dataset.mode = 'terminal'; else delete root.dataset.mode;
      toast(on ? '+30 lives. Terminal Edition unlocked. Repeat the code to return.' : 'Back to print.');
      confetti();
      return;
    }

    if (k === '?') { toast('Shortcuts: n = night edition · t = top · ? = this help · ↑↑↓↓←→←→BA = ???', 5000); return; }
    if (k === 'n') { edition?.(); return; }
    if (k === 't') { scrollTo({ top: 0, behavior: 'smooth' }); return; }

    if (k.length === 1) {
      typed = (typed + k).slice(-12);
      for (const [word, fn] of Object.entries(COMMANDS)) if (typed.endsWith(word)) { typed = ''; fn(); break; }
    }
  });

  /* footer mark: five clicks spin it */
  const reg = $('#reg');
  let clicks = 0, ct;
  reg?.addEventListener('click', () => {
    clicks++;
    clearTimeout(ct);
    ct = setTimeout(() => { clicks = 0; }, 1500);
    if (clicks >= 5) {
      clicks = 0;
      reg.classList.remove('spin'); void reg.getBoundingClientRect(); reg.classList.add('spin');
      toast('Registration marks aligned. The presses are happy.');
      confetti();
    }
  });

  /* playful tooltips */
  const tips = [
    ['#clock', 'Yes, it is probably time for biriyani.'],
    ['#vol', 'Volume = years at IIIT-H. No refunds.'],
    ['#edition', 'Press n. Your eyes will thank you.'],
    ['.ticker', 'Not financial advice. Definitely not.'],
  ];
  for (const [sel, t] of tips) { const el = $(sel); if (el && !el.title) el.title = t; }

  /* rotating footer messages */
  const foot = $('#foot-msg');
  if (foot) {
    const msgs = [
      foot.textContent,
      'No pixels were harmed in the making of this page.',
      'Corrections: none. Regrets: Python 2.',
      'Hint: the keyboard knows things.',
      'Stop press: still no desktop environment.',
    ];
    let i = 0;
    setInterval(() => { if (!document.hidden) foot.textContent = msgs[i = (i + 1) % msgs.length]; }, 7000);
  }
}
