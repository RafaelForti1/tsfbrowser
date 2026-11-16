/* TSF Atmosphere — o navegador muda de aparência conforme o ambiente: cores, iluminação,
   fundo animado, sons ambientes opcionais (gerados em tempo real com WebAudio) e ajustes de interface. */
'use strict';

const Atmo = (() => {
  const MODES = {
    nebula: { name: 'Nebulosa', desc: 'O visual padrão do TSF: violeta elétrico e ciano, com estrelas discretas.', i: 'sparkle',
      primary: '#695CFF', accent: '#25D9F2', soft: '#B49CFF', bg: '#090B12', speed: 26, fx: 'stars', sound: 'pad',
      blobs: ['140,70,255,.42', '70,90,255,.36', '180,80,230,.30', '37,217,242,.14'] },
    focus: { name: 'Foco', desc: 'Pouco brilho e nada de distrações. Esconde o painel; ruído marrom para concentrar.', i: 'focus',
      primary: '#7C8CFF', accent: '#8FD3FF', soft: '#AEB8FF', bg: '#06070B', speed: 70, fx: 'none', sound: 'brown',
      blobs: ['70,80,140,.20', '50,60,110,.16', '60,60,90,.12', '80,120,160,.06'], ui: { panel: false } },
    relax: { name: 'Relaxar', desc: 'Tons de oceano, partículas lentas flutuando e som de ondas.', i: 'leaf',
      primary: '#2DD4BF', accent: '#60A5FA', soft: '#99F6E4', bg: '#051013', speed: 44, fx: 'bokeh', sound: 'waves',
      blobs: ['20,140,140,.38', '40,90,200,.30', '20,110,160,.26', '120,220,200,.14'] },
    study: { name: 'Estudos', desc: 'Âmbar aconchegante, poeira de luz e chuva suave. Abre as Quick Notes.', i: 'book',
      primary: '#F59E0B', accent: '#FCD34D', soft: '#FDE68A', bg: '#0E0A06', speed: 38, fx: 'dust', sound: 'rain',
      blobs: ['200,110,30,.30', '150,70,30,.24', '220,150,60,.18', '250,200,120,.10'], ui: { panel: true, panelTab: 'notes' } },
    games: { name: 'Jogos', desc: 'Neon magenta e ciano, grade synthwave em movimento e pad eletrônico.', i: 'gamepad',
      primary: '#FF2E97', accent: '#00F0FF', soft: '#FF8AD1', bg: '#0A0612', speed: 14, fx: 'grid', sound: 'synth',
      blobs: ['255,46,151,.40', '0,200,255,.30', '140,40,255,.34', '0,240,255,.18'] },
    work: { name: 'Trabalho', desc: 'Azul limpo e sóbrio para o expediente. Sem animações de fundo.', i: 'briefcase',
      primary: '#3B82F6', accent: '#22D3EE', soft: '#93C5FD', bg: '#080B12', speed: 40, fx: 'none', sound: '',
      blobs: ['40,90,200,.26', '30,120,200,.20', '60,80,160,.16', '34,211,238,.10'] },
  };
  const SOUNDS = { '': 'Sem som', rain: 'Chuva', waves: 'Ondas', brown: 'Ruído marrom', pad: 'Pad cósmico', synth: 'Synthwave' };
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
  const mode = () => MODES[S.atmo.mode] || MODES.nebula;

  // ---------------------------------------------------------------- som
  const Sound = (() => {
    let ctx = null, master = null, nodes = [], playing = '';
    const buffers = {};
    function noise(kind) {
      if (buffers[kind]) return buffers[kind];
      const len = ctx.sampleRate * 6;
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
          else if (kind === 'pink') {
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
            b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
            d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
          } else d[i] = w * 0.5;
        }
      }
      return (buffers[kind] = buf);
    }
    const src = kind => { const s = ctx.createBufferSource(); s.buffer = noise(kind); s.loop = true; s.loopStart = Math.random(); nodes.push(s); return s; };
    const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const osc = (type, f, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; nodes.push(o); return o; };
    const lfo = (rate, depth, target) => { const o = osc('sine', rate); const g = gain(depth); o.connect(g); g.connect(target); };
    const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

    const BUILD = {
      brown() { chain(src('brown'), filt('lowpass', 700), gain(0.9), master); },
      rain() {
        chain(src('pink'), filt('highpass', 500), filt('lowpass', 6500), gain(0.55), master);
        const drops = gain(0.18); chain(src('white'), filt('bandpass', 3200, 0.8), drops, master);
        lfo(5.3, 0.12, drops.gain);
      },
      waves() {
        const g = gain(0.45);
        chain(src('brown'), filt('lowpass', 520), g, master);
        lfo(0.085, 0.38, g.gain);
        const foam = gain(0.06); chain(src('pink'), filt('highpass', 1800), foam, master);
        lfo(0.085, 0.05, foam.gain);
      },
      pad() {
        const lp = filt('lowpass', 900, 0.4); const out = gain(0.11);
        chain(lp, out, master);
        [[110, 0], [164.8, 4], [220.5, -5], [277.2, 3], [329.6, -2]].forEach(([f, dt]) => { const o = osc('triangle', f, dt); chain(o, gain(0.5), lp); });
        lfo(0.06, 380, lp.frequency);
        chain(src('pink'), filt('bandpass', 1200, 0.5), gain(0.02), master);
      },
      synth() {
        const lp = filt('lowpass', 520, 3); const out = gain(0.06);
        chain(lp, out, master);
        [[55, 0], [55, 9], [82.4, -6], [110, 4]].forEach(([f, dt]) => chain(osc('sawtooth', f, dt), lp));
        lfo(0.14, 340, lp.frequency);
        const sub = gain(0.05); chain(osc('sine', 55), sub, master);
        lfo(1.8, 0.03, sub.gain);
      },
    };

    function stop(fade = 0.5) {
      if (!ctx || !master) return;
      const m = master, ns = nodes;
      m.gain.cancelScheduledValues(ctx.currentTime);
      m.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      setTimeout(() => { ns.forEach(n => { try { n.stop(); } catch (e) { /* já parado */ } }); m.disconnect(); }, fade * 1000 + 100);
      master = null; nodes = []; playing = '';
    }
    function play(type, vol) {
      if (playing === type && master) { setVolume(vol); return; }
      stop(0.4);
      if (!type || !BUILD[type]) return;
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      master = gain(0);
      master.connect(ctx.destination);
      BUILD[type]();
      nodes.forEach(n => n.start());
      master.gain.setTargetAtTime(vol, ctx.currentTime, 0.6);
      playing = type;
    }
    function setVolume(v) { if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1); }
    document.addEventListener('pointerdown', () => { if (ctx && ctx.state === 'suspended') ctx.resume(); });
    return { play, stop, setVolume, playing: () => playing };
  })();

  // ---------------------------------------------------------------- fundo animado
  const Fx = (() => {
    const cv = $('#atmoFx');
    const ctx = cv.getContext('2d');
    let kind = 'none', parts = [], raf = 0, last = 0, t0 = performance.now();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function seed() {
      const W = innerWidth, H = innerHeight, R = Math.random;
      const n = { stars: 110, bokeh: 22, dust: 55, grid: 70, none: 0 }[kind] || 0;
      parts = Array.from({ length: n }, () => ({ x: R() * W, y: R() * H, r: R(), p: R() * 6.28, v: 0.2 + R() * 0.8 }));
    }
    function frame(now) {
      raf = 0;
      if (kind === 'none' || document.hidden) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 40) return;
      last = now;
      const t = (now - t0) / 1000, W = innerWidth, H = innerHeight;
      const m = mode(), pr = rgb(m.primary), ac = rgb(m.accent), so = rgb(m.soft);
      ctx.clearRect(0, 0, W, H);
      if (kind === 'stars' || kind === 'grid') {
        for (const s of parts) {
          const a = 0.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.v * 1.5 + s.p));
          ctx.fillStyle = `rgba(${s.r > 0.7 ? ac : so},${a})`;
          ctx.fillRect(s.x, kind === 'grid' ? s.y * 0.55 : s.y, s.r * 1.6 + 0.4, s.r * 1.6 + 0.4);
        }
      }
      if (kind === 'grid') {
        const hz = H * 0.62, speed = (t * 0.35) % 1;
        const grad = ctx.createLinearGradient(0, hz, 0, H);
        grad.addColorStop(0, `rgba(${pr},0)`); grad.addColorStop(1, `rgba(${pr},.16)`);
        ctx.fillStyle = grad; ctx.fillRect(0, hz, W, H - hz);
        ctx.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
          const z = (i + speed) / 14;
          const y = hz + (H - hz) * z * z;
          ctx.strokeStyle = `rgba(${pr},${0.05 + 0.3 * z})`;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        for (let i = -16; i <= 16; i++) {
          ctx.strokeStyle = `rgba(${ac},${0.16 - Math.abs(i) * 0.006})`;
          ctx.beginPath(); ctx.moveTo(W / 2 + i * 14, hz); ctx.lineTo(W / 2 + i * W * 0.11, H); ctx.stroke();
        }
        const sun = ctx.createRadialGradient(W / 2, hz, 0, W / 2, hz, H * 0.28);
        sun.addColorStop(0, `rgba(${pr},.22)`); sun.addColorStop(1, `rgba(${pr},0)`);
        ctx.fillStyle = sun; ctx.fillRect(0, hz - H * 0.3, W, H * 0.3);
      } else if (kind === 'bokeh') {
        for (const b of parts) {
          b.y -= b.v * 0.35; b.x += Math.sin(t * 0.3 + b.p) * 0.2;
          if (b.y < -80) { b.y = H + 80; b.x = Math.random() * W; }
          const r = 18 + b.r * 46;
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
          const c = b.r > 0.5 ? ac : pr;
          g.addColorStop(0, `rgba(${c},${0.10 + b.r * 0.08})`); g.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 6.29); ctx.fill();
        }
      } else if (kind === 'dust') {
        for (const d of parts) {
          d.y += d.v * 0.18; d.x += Math.sin(t * 0.5 + d.p) * 0.25;
          if (d.y > H + 10) { d.y = -10; d.x = Math.random() * W; }
          ctx.fillStyle = `rgba(${so},${0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t + d.p))})`;
          ctx.beginPath(); ctx.arc(d.x, d.y, 0.6 + d.r * 1.6, 0, 6.29); ctx.fill();
        }
      }
    }
    function set(k) {
      kind = reduce ? 'none' : k;
      size(); seed();
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (!raf && kind !== 'none') raf = requestAnimationFrame(frame);
    }
    addEventListener('resize', () => { size(); seed(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf && kind !== 'none') raf = requestAnimationFrame(frame); });
    return { set };
  })();

  // ---------------------------------------------------------------- aplicar
  function apply(adaptUi) {
    const m = mode();
    const r = document.documentElement.style;
    r.setProperty('--primary', m.primary);
    r.setProperty('--accent', m.accent);
    r.setProperty('--primary-soft', m.soft);
    r.setProperty('--glow', rgb(m.primary));
    r.setProperty('--glow2', rgb(m.accent));
    r.setProperty('--glow-soft', rgb(m.soft));
    r.setProperty('--bg', m.bg);
    r.setProperty('--ambient-speed', m.speed + 's');
    m.blobs.forEach((b, i) => r.setProperty('--b' + (i + 1), `rgba(${b})`));
    body.dataset.atmo = S.atmo.mode;
    waveColors = [m.primary, m.soft, m.accent];
    Fx.set(m.fx);
    if (adaptUi && m.ui) { Object.assign(S.settings, m.ui); S.settings.focus = false; applyLayout(); renderPanel(); }
    if (S.atmo.sound) Sound.play(S.atmo.soundType, S.atmo.volume); else Sound.stop();
    renderChip();
  }

  function renderChip() {
    const m = mode();
    $('#atmoChip').innerHTML = `${icon(m.i, 'sm')}<span>${esc(m.name)}</span>${S.atmo.sound && S.atmo.soundType ? icon('volume', 'sm') : ''}`;
    $('#atmoChip').title = `TSF Atmosphere: ${m.name}${S.atmo.sound && S.atmo.soundType ? ' · ' + SOUNDS[S.atmo.soundType] : ''} (Ctrl+Shift+M)`;
  }

  function setMode(id, adaptUi = true) {
    if (!MODES[id]) return;
    S.atmo.mode = id;
    S.atmo.soundType = MODES[id].sound;
    apply(adaptUi);
    save();
  }

  function pickerHtml() {
    const cur = S.atmo.mode;
    return `<div class="atmo-picker dialog wide" role="dialog" aria-label="TSF Atmosphere">
      <div class="atmo-head">${icon('sun', 'lg')}<div><h3>TSF Atmosphere</h3><p>Escolha o clima do navegador. As páginas não mudam — só o ambiente ao redor.</p></div>
        <button class="ib sm" data-x="close" title="Fechar (Esc)">${icon('x')}</button></div>
      <div class="atmo-grid">${Object.entries(MODES).map(([id, m]) => `
        <button class="atmo-card ${id === cur ? 'on' : ''}" data-mode="${id}" style="--p:${m.primary};--a:${m.accent};--bgc:${m.bg}">
          <span class="atmo-prev"><i></i><i></i><i></i></span>
          <b>${icon(m.i, 'sm')}${esc(m.name)}</b><span>${esc(m.desc)}</span></button>`).join('')}</div>
      <div class="atmo-sound">
        <label class="switch"><input type="checkbox" id="atSound" ${S.atmo.sound ? 'checked' : ''}><i></i>Sons ambientes</label>
        <div class="atmo-sounds">${Object.entries(SOUNDS).filter(([k]) => k).map(([k, n]) => `<button class="chip sm ${S.atmo.soundType === k ? 'on' : ''}" data-snd="${k}">${esc(n)}</button>`).join('')}</div>
        <label class="atmo-vol">${icon('volume', 'sm')}<input type="range" id="atVol" min="0" max="1" step="0.01" value="${S.atmo.volume}"></label>
      </div>
    </div>`;
  }

  function openPicker() {
    const el = openOverlay(pickerHtml());
    const root = el.querySelector('.atmo-picker');
    root.addEventListener('click', e => {
      if (e.target.closest('[data-x="close"]')) return closeOverlay();
      const c = e.target.closest('[data-mode]');
      if (c) {
        setMode(c.dataset.mode);
        $$('[data-mode]', root).forEach(b => b.classList.toggle('on', b === c));
        $$('[data-snd]', root).forEach(b => b.classList.toggle('on', b.dataset.snd === S.atmo.soundType));
        return;
      }
      const s = e.target.closest('[data-snd]');
      if (s) {
        S.atmo.soundType = s.dataset.snd; S.atmo.sound = true;
        $('#atSound', root).checked = true;
        $$('[data-snd]', root).forEach(b => b.classList.toggle('on', b === s));
        apply(false); save();
      }
    });
    $('#atSound', root).addEventListener('change', e => {
      S.atmo.sound = e.target.checked;
      if (S.atmo.sound && !S.atmo.soundType) S.atmo.soundType = mode().sound || 'pad';
      $$('[data-snd]', root).forEach(b => b.classList.toggle('on', b.dataset.snd === S.atmo.soundType));
      apply(false); save();
    });
    $('#atVol', root).addEventListener('input', e => { S.atmo.volume = Number(e.target.value); Sound.setVolume(S.atmo.volume); clearTimeout(openPicker.t); openPicker.t = setTimeout(save, 300); });
  }

  return {
    apply, setMode, openPicker,
    current: () => mode(),
    commandItems(nq) {
      return Object.entries(MODES).filter(([, m]) => scoreText('atmosfera ambiente ' + m.name, nq) > 0)
        .map(([id, m]) => ({ i: m.i, t: `Atmosfera: ${m.name}`, sub: id === S.atmo.mode ? 'ativa' : '', color: m.primary, run: () => setMode(id) }));
    },
  };
})();
