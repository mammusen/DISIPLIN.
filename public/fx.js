// Interaktivitet og liv: innloggingsskjerm med glør og klokke, hilsen og
// nedtelling i toppen, fremdriftsbar for dagen, feiring når du krysser av,
// et kjæledyr som snakker, lys som følger pekeren og tastatursnarveier.
// Lastes til slutt og bruker state, render, showToast, showTab, WORDS og
// dayIndex fra app.js og motivation.js. Ingenting her endrer data.

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const $ = (id) => document.getElementById(id);

  function accentColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d1382f';
  }

  // Norsk tid (appens dag skifter kl. 04, som på serveren).
  function osloParts(d = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute') };
  }

  function greeting(h) {
    if (h >= 4 && h < 10) return 'God morgen';
    if (h >= 10 && h < 17) return 'God dag';
    if (h >= 17 && h < 23) return 'God kveld';
    return 'Sent ute';
  }

  function minutesLeftOfDay(p) {
    // Dagen varer til 04:00 neste morgen.
    const now = p.h * 60 + p.min;
    const end = 4 * 60;
    return now < end ? end - now : 24 * 60 - now + end;
  }

  function fmtLeft(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h} t ${m} min` : `${m} min`;
  }

  function appDateStr() {
    // Samme dato som serveren regner med: Oslo-tid minus fire timer.
    const p = osloParts(new Date(Date.now() - 4 * 3600 * 1000));
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }

  /* ------------------------------------------------------------------ */
  /* Partikler: glør på innloggingen, gnister når du krysser av          */
  /* ------------------------------------------------------------------ */

  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  function burst(x, y, { count = 14, spread = 70, colors, size = 7 } = {}) {
    if (reduceMotion) return;
    const palette = colors || [accentColor(), '#f3c14b', '#5fae68', '#f3ece0'];
    for (let i = 0; i < count; i += 1) {
      const p = document.createElement('span');
      p.className = 'fx-spark';
      const angle = Math.random() * Math.PI * 2;
      const dist = spread * (0.45 + Math.random() * 0.75);
      const s = size * (0.6 + Math.random() * 0.8);
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.width = `${s}px`;
      p.style.height = `${s}px`;
      p.style.background = palette[i % palette.length];
      layer.appendChild(p);
      const anim = p.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 30}px)) scale(0.2) rotate(${Math.random() * 360}deg)`,
            opacity: 0,
          },
        ],
        { duration: 650 + Math.random() * 450, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
      anim.onfinish = () => p.remove();
    }
  }

  function bigCelebration() {
    if (reduceMotion) return;
    const w = window.innerWidth;
    for (let i = 0; i < 5; i += 1) {
      setTimeout(() => burst(w * (0.15 + Math.random() * 0.7), window.innerHeight * (0.2 + Math.random() * 0.3), { count: 26, spread: 160, size: 9 }), i * 140);
    }
  }

  // Glør som stiger opp bak innloggingen.
  const embers = (() => {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-embers';
    canvas.setAttribute('aria-hidden', 'true');
    const auth = $('auth-screen');
    auth.prepend(canvas);
    const ctx = canvas.getContext('2d');
    let parts = [];
    let raf = null;
    let dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    }

    function spawn(initial) {
      return {
        x: Math.random() * canvas.width,
        y: initial ? Math.random() * canvas.height : canvas.height + 10 * dpr,
        r: (0.8 + Math.random() * 2.2) * dpr,
        vy: (0.25 + Math.random() * 0.8) * dpr,
        vx: (Math.random() - 0.5) * 0.3 * dpr,
        life: Math.random() * Math.PI * 2,
      };
    }

    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const color = accentColor();
      for (const p of parts) {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(p.life) * 0.25 * dpr;
        p.life += 0.03;
        if (p.y < -10) Object.assign(p, spawn(false));
        const flicker = 0.45 + Math.sin(p.life * 3) * 0.25;
        ctx.globalAlpha = Math.max(0, flicker) * Math.min(1, p.y / (canvas.height * 0.35));
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * dpr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    return {
      start() {
        if (reduceMotion || raf) return;
        resize();
        const n = Math.round(Math.min(70, (window.innerWidth * window.innerHeight) / 18000));
        parts = Array.from({ length: n }, () => spawn(true));
        raf = requestAnimationFrame(frame);
      },
      stop() {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
      resize,
    };
  })();

  window.addEventListener('resize', () => {
    if (!$('auth-screen').hidden) embers.resize();
  });

  /* ------------------------------------------------------------------ */
  /* Innloggingsskjermen                                                 */
  /* ------------------------------------------------------------------ */

  const authHero = document.createElement('div');
  authHero.className = 'auth-hero';
  authHero.innerHTML =
    '<div class="auth-clock" id="auth-clock"></div>' +
    '<div class="auth-date" id="auth-date"></div>' +
    '<div class="auth-greet" id="auth-greet"></div>' +
    '<div class="auth-word" id="auth-word"></div>';
  $('auth-screen').insertBefore(authHero, $('profile-picker-view'));

  function tickAuth() {
    const now = new Date();
    const p = osloParts(now);
    $('auth-clock').textContent = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
    const date = now.toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' });
    $('auth-date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
    $('auth-greet').textContent = `${greeting(p.h)}. ${fmtLeft(minutesLeftOfDay(p))} igjen av dagen.`;
    if (typeof WORDS !== 'undefined' && typeof dayIndex === 'function') {
      const w = WORDS[dayIndex(appDateStr(), WORDS.length)];
      $('auth-word').innerHTML = '';
      const label = document.createElement('span');
      label.textContent = 'Dagens ord';
      const word = document.createElement('strong');
      word.textContent = w.word;
      $('auth-word').append(label, word);
    }
  }

  // Feil kode: prikkene rister. Riktig kode: appen glir inn.
  new MutationObserver(() => {
    const err = $('pin-error');
    if (!err.hidden) {
      const dots = $('pin-dots');
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
      if (navigator.vibrate) {
        try { navigator.vibrate([30, 40, 30]); } catch (e) { /* ikke støttet */ }
      }
    }
  }).observe($('pin-error'), { attributes: true, attributeFilter: ['hidden'] });

  // Skriv koden med tastaturet også.
  document.addEventListener('keydown', (e) => {
    if ($('auth-screen').hidden || $('pin-view').hidden) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let key = null;
    if (/^[0-9]$/.test(e.key)) key = document.querySelector(`.pin-key[data-key="${e.key}"]`);
    else if (e.key === 'Backspace') key = $('pin-del');
    else if (e.key === 'Escape') key = $('pin-back');
    if (!key) return;
    e.preventDefault();
    key.classList.add('pressed');
    setTimeout(() => key.classList.remove('pressed'), 140);
    key.click();
  });

  // Følg med på når innloggingen og appen vises.
  function onScreenChange() {
    const authVisible = !$('auth-screen').hidden;
    if (authVisible) {
      tickAuth();
      embers.start();
    } else {
      embers.stop();
    }
    const app = $('app');
    if (!app.hidden && !app.dataset.entered) {
      app.dataset.entered = '1';
      app.classList.remove('app-enter');
      void app.offsetWidth;
      app.classList.add('app-enter');
    }
    if (app.hidden) delete app.dataset.entered;
  }
  const screenObserver = new MutationObserver(onScreenChange);
  screenObserver.observe($('auth-screen'), { attributes: true, attributeFilter: ['hidden'] });
  screenObserver.observe($('app'), { attributes: true, attributeFilter: ['hidden'] });
  onScreenChange();

  /* ------------------------------------------------------------------ */
  /* Toppen av appen: hilsen og hvor mye som er igjen av dagen           */
  /* ------------------------------------------------------------------ */

  const tagline = document.querySelector('.topbar .tagline');
  const greetLine = document.createElement('span');
  greetLine.className = 'app-greet';
  const leftLine = document.createElement('span');
  leftLine.className = 'app-left';
  if (tagline) {
    tagline.textContent = '';
    tagline.classList.add('app-greeting');
    tagline.append(greetLine, leftLine);
  }

  function tickGreeting() {
    if (!tagline) return;
    const p = osloParts();
    const name = (state && state.user && state.user.username) || $('username-pill').textContent || '';
    greetLine.textContent = `${greeting(p.h)}${name ? `, ${name}` : ''}.`;
    leftLine.textContent = `${fmtLeft(minutesLeftOfDay(p))} igjen av dagen`;
  }

  setInterval(() => {
    if (!$('auth-screen').hidden) tickAuth();
    if (!$('app').hidden) tickGreeting();
  }, 20000);

  /* ------------------------------------------------------------------ */
  /* Dagens fremdrift                                                    */
  /* ------------------------------------------------------------------ */

  const todayCard = $('today-tasks').closest('.card');
  const progress = document.createElement('div');
  progress.className = 'day-progress';
  progress.innerHTML =
    '<div class="day-progress-top"><span class="day-progress-label">Dagens fremdrift</span><span class="day-progress-count" id="day-progress-count"></span></div>' +
    '<div class="day-progress-track"><div class="day-progress-fill" id="day-progress-fill"></div></div>';
  todayCard.querySelector('h2').after(progress);

  let lastAllDone = null;
  let lastStreak = null;
  let lastXp = null;

  function renderFx() {
    tickGreeting();

    const tasks = state.today.tasks;
    const done = tasks.filter((t) => t.done).length;
    const total = tasks.length;
    progress.hidden = total === 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('day-progress-fill').style.width = `${pct}%`;
    $('day-progress-count').textContent = `${done} av ${total} · ${pct}%`;
    progress.classList.toggle('complete', total > 0 && done === total);

    const allDone = total > 0 && done === total;
    if (lastAllDone === false && allDone) {
      bigCelebration();
      if (!state.today.reflection) showToast('Alt er gjort i dag! Fullfør dagen for å få XP-en. 🔥', 5000);
    }
    lastAllDone = allDone;

    const streakEl = $('streak');
    if (lastStreak !== null && state.profile.streak > lastStreak) pulse(streakEl);
    lastStreak = state.profile.streak;

    const xpEl = $('xp-label');
    if (lastXp !== null && state.profile.totalXp !== lastXp) pulse(xpEl);
    lastXp = state.profile.totalXp;
  }

  function pulse(el) {
    if (!el || reduceMotion) return;
    el.classList.remove('fx-pulse');
    void el.offsetWidth;
    el.classList.add('fx-pulse');
  }

  // Gnister når en oppgave krysses av.
  document.addEventListener('change', (e) => {
    const cb = e.target;
    if (!(cb instanceof HTMLInputElement) || cb.type !== 'checkbox' || !cb.checked) return;
    if (!cb.closest('.task-item, .weekly-goal')) return;
    const r = cb.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
  });
  document.addEventListener('click', (e) => {
    const box = e.target.closest('.habit-box');
    if (!box || box.disabled || box.classList.contains('done')) return;
    const r = box.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, { count: 10, spread: 50 });
  });

  // Nivå opp: stor feiring.
  const showToastBase = showToast;
  showToast = function showToastWithFx(msg, ms) {
    showToastBase(msg, ms);
    if (/Nivå opp|7 av 7/.test(String(msg))) bigCelebration();
  };

  /* ------------------------------------------------------------------ */
  /* Kjæledyret snakker                                                   */
  /* ------------------------------------------------------------------ */

  const pet = $('pet-emoji');
  pet.setAttribute('role', 'button');
  pet.setAttribute('tabindex', '0');
  pet.setAttribute('aria-label', 'Klapp kjæledyret');
  const bubble = document.createElement('div');
  bubble.className = 'pet-bubble';
  bubble.setAttribute('role', 'status');
  bubble.hidden = true;
  $('pet-card').appendChild(bubble);
  let bubbleTimer = null;
  let lastLine = '';

  function petLines() {
    const s = state.profile.streak;
    const left = state.today.tasks.filter((t) => !t.done).length;
    const lines = [
      'Jeg vokser når du fullfører dager. Bare så du vet det.',
      'Disiplin slår motivasjon. Hver gang.',
    ];
    if (left > 0) lines.push('Klapp meg gjerne, men kryss av noe først 👀', 'Én oppgave til, så tar vi en pause. Avtale?');
    if (s >= 2) lines.push(`${s} dager på rad! Ikke brekk streaken nå.`);
    if (s === 0) lines.push('Null streak? I dag starter vi en ny.');
    if (left > 0) lines.push(`${left} ${left === 1 ? 'oppgave' : 'oppgaver'} igjen i dag. Du klarer det.`);
    if (left === 0 && state.today.tasks.length) lines.push('Alt gjort! Husk å fullføre dagen.');
    if (!state.tomorrow.tasks.length) lines.push('Har du planlagt i morgen enda? Jeg spør for en venn.');
    return lines.filter((l) => l !== lastLine);
  }

  function poke() {
    const lines = petLines();
    lastLine = lines[Math.floor(Math.random() * lines.length)];
    bubble.textContent = lastLine;
    bubble.hidden = false;
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
    pet.classList.remove('fx-bounce');
    void pet.offsetWidth;
    pet.classList.add('fx-bounce');
    const r = pet.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 3, { count: 8, spread: 45, colors: ['#ff6b8a', '#f3c14b', accentColor()] });
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 3800);
  }

  pet.addEventListener('click', poke);
  pet.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      poke();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Lys som følger pekeren (bare med mus)                               */
  /* ------------------------------------------------------------------ */

  if (finePointer && !reduceMotion) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.card, .pet-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tastatursnarveier: 1-5 bytter fane, N = ny oppgave i dag            */
  /* ------------------------------------------------------------------ */

  const TAB_ORDER = ['today', 'week', 'later', 'progress', 'motivation'];
  document.addEventListener('keydown', (e) => {
    if ($('app').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.closest('input, textarea, select') || t.isContentEditable)) return;
    if (/^[1-5]$/.test(e.key)) {
      showTab(TAB_ORDER[Number(e.key) - 1]);
    } else if (e.key === 'n' || e.key === 'N') {
      const input = $('new-today-task-title');
      if (input && !$('add-today-task-form').hidden) {
        e.preventDefault();
        showTab('today');
        input.focus();
      }
    }
  });

  /* ------------------------------------------------------------------ */
  /* Koble inn i render()                                                */
  /* ------------------------------------------------------------------ */

  const renderWithoutFx = render;
  render = function renderWithFx() {
    renderWithoutFx();
    if (state) renderFx();
  };
})();
