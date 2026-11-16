/* Responsive Lab — a mesma página em vários dispositivos ao mesmo tempo.
   Cada dispositivo é um WebView real com a largura de viewport do aparelho (via zoom)
   e o user agent correspondente, então o site serve a versão mobile de verdade. */
'use strict';

const Lab = (() => {
  const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const DEVICES = {
    iphone: { name: 'iPhone 15', w: 393, h: 852, ua: UA_IPHONE, kind: 'phone', i: 'phone' },
    pixel: { name: 'Pixel 8', w: 412, h: 915, ua: UA_ANDROID, kind: 'phone', i: 'phone' },
    se: { name: 'iPhone SE', w: 375, h: 667, ua: UA_IPHONE, kind: 'phone', i: 'phone' },
    ipad: { name: 'iPad mini', w: 768, h: 1024, ua: UA_IPAD, kind: 'tablet', i: 'tablet' },
    laptop: { name: 'Laptop', w: 1366, h: 768, ua: '', kind: 'desktop', i: 'laptop' },
    desktop: { name: 'Desktop HD', w: 1920, h: 1080, ua: '', kind: 'desktop', i: 'monitor' },
  };
  const ORDER = ['iphone', 'se', 'pixel', 'ipad', 'laptop', 'desktop'];
  const created = new Map();     // tabId -> Set(devId)
  const devUrl = new Map();      // viewId -> url atual
  const devLoading = new Map();
  let root = null, tab = null, ro = null, raf = 0;

  const vid = (t, d) => `lab-${t.id}-${d}`;
  const parse = id => { const m = /^lab-(.+)-([a-z]+)$/.exec(id); return m ? { tab: tabById(m[1]), dev: m[2] } : null; };

  function cfg(t) {
    if (!t.lab) t.lab = { url: '', devs: ['iphone', 'ipad', 'laptop'], rot: false, sync: true };
    return t.lab;
  }

  function ensureViews(t) {
    const L = cfg(t);
    if (!L.url) return;
    let set = created.get(t.id);
    if (!set) created.set(t.id, set = new Set());
    for (const d of L.devs) {
      if (set.has(d)) continue;
      set.add(d);
      devUrl.set(vid(t, d), L.url);
      devLoading.set(vid(t, d), true);
      send('tab:create', { id: vid(t, d), ws: t.ws, url: L.url, ua: DEVICES[d].ua });
    }
    for (const d of Array.from(set)) if (!L.devs.includes(d)) { set.delete(d); send('tab:close', { id: vid(t, d) }); }
  }

  function navigateAll(t, url, except) {
    const set = created.get(t.id) || new Set();
    for (const d of set) {
      const id = vid(t, d);
      if (id === except || devUrl.get(id) === url) continue;
      devUrl.set(id, url);
      send('tab:navigate', { id, url });
    }
  }

  function dims(d, rot) { const D = DEVICES[d]; return rot && D.kind !== 'desktop' ? { w: D.h, h: D.w } : { w: D.w, h: D.h }; }

  // escolhe 1–3 linhas e a maior escala em que todos os dispositivos cabem
  function fit(devs, rot, W, H) {
    const LABEL = 30, GAP = 22, BEZ = 14;
    let best = null;
    for (let rows = 1; rows <= Math.min(3, devs.length); rows++) {
      const per = Math.ceil(devs.length / rows);
      const groups = [];
      for (let i = 0; i < devs.length; i += per) groups.push(devs.slice(i, i + per));
      let s = 1;
      for (const g of groups) {
        const sw = g.reduce((a, d) => a + dims(d, rot).w, 0);
        s = Math.min(s, (W - GAP * (g.length - 1) - BEZ * g.length) / sw);
      }
      const sh = groups.reduce((a, g) => a + Math.max(...g.map(d => dims(d, rot).h)), 0);
      s = Math.min(s, (H - groups.length * (LABEL + BEZ) - GAP * (groups.length - 1)) / sh);
      if (!best || s > best.s) best = { s, groups };
    }
    best.s = Math.max(0.25, Math.floor(best.s * 100) / 100);
    return best;
  }

  function stageHtml() {
    const L = cfg(tab);
    if (!L.url) return `<div class="lab-empty">${icon('devices', 'lg')}<b>Digite uma URL acima</b><span>Ex.: localhost:3000 — a página abre em todos os dispositivos selecionados ao mesmo tempo.</span></div>`;
    if (!L.devs.length) return `<div class="lab-empty"><b>Selecione ao menos um dispositivo.</b></div>`;
    const st = $('#labStage', root);
    const r = st.getBoundingClientRect();
    const devs = ORDER.filter(d => L.devs.includes(d));
    const { s, groups } = fit(devs, L.rot, r.width - 24, r.height - 16);
    return groups.map(g => `<div class="lab-row">${g.map(d => {
      const D = DEVICES[d], dm = dims(d, L.rot);
      const w = Math.round(dm.w * s), h = Math.round(dm.h * s);
      const id = vid(tab, d);
      return `<div class="lab-dev ${D.kind}" data-dev="${d}">
        <div class="lab-label">${icon(D.i, 'sm')}<b>${esc(D.name)}</b><span>${dm.w}×${dm.h} · ${Math.round(s * 100)}%</span><i class="lab-load ${devLoading.get(id) ? 'on' : ''}" data-load="${esc(id)}"></i></div>
        <div class="lab-bezel"><div class="lab-screen" data-view="${esc(id)}" data-zoom="${s}" data-r="${D.kind === 'phone' ? 18 : 8}" style="width:${w}px;height:${h}px"><img class="snap" alt="" hidden></div></div>
      </div>`;
    }).join('')}</div>`).join('');
  }

  function relayout() {
    if (!root) return;
    $('#labStage', root).innerHTML = stageHtml();
    // dispositivos que não couberem ficam ocultos (WebViews nativos não podem ser recortados)
    const sr = $('#labStage', root).getBoundingClientRect();
    $$('.lab-screen', root).forEach(el => {
      const r = el.getBoundingClientRect();
      const off = r.right > sr.right + 1 || r.bottom > sr.bottom + 1;
      el.dataset.off = off ? '1' : '';
      el.closest('.lab-dev').classList.toggle('clipped', off);
    });
    scheduleLayout();
  }

  function toolbarHtml() {
    const L = cfg(tab);
    return `<form class="lab-url" id="labForm">${icon('globe', 'sm')}<input name="u" value="${esc(L.url)}" placeholder="URL para testar — ex.: localhost:3000" spellcheck="false" ${L.url ? '' : 'data-autofocus'}><button class="btn primary" type="submit">Carregar</button></form>
      <div class="lab-devs">${ORDER.map(d => `<button class="chip ${L.devs.includes(d) ? 'on' : ''}" data-ldev="${d}" title="${DEVICES[d].w}×${DEVICES[d].h}">${icon(DEVICES[d].i, 'sm')}${esc(DEVICES[d].name)}</button>`).join('')}</div>
      <div class="lab-tools">
        <button class="ib ${L.rot ? 'on' : ''}" data-lact="rot" title="Girar celulares e tablets">${icon('rotate')}</button>
        <button class="ib ${L.sync ? 'on' : ''}" data-lact="sync" title="Sincronizar navegação entre dispositivos">${icon('sync')}</button>
        <button class="ib" data-lact="reload" title="Recarregar todos (F5)">${icon('reload')}</button>
        <button class="ib" data-lact="open" title="Abrir em uma aba normal">${icon('external')}</button>
      </div>`;
  }

  return {
    open(url) {
      const w = curWeb();
      url = url || (w ? w.url : '');
      openInternal('tsf://lab' + (url ? '?u=' + encodeURIComponent(url) : ''));
    },
    render(t) {
      return `<div class="lab"><div class="lab-bar" id="labBar"></div><div class="lab-stage" id="labStage"></div></div>`;
    },
    mount(r, t) {
      root = r; tab = t;
      const L = cfg(t);
      const pu = internalParams(t.url).get('u');
      if (pu && pu !== L.url) { L.url = pu; navigateAll(t, pu); }
      t.url = 'tsf://lab';
      $('#labBar', root).innerHTML = toolbarHtml();
      ensureViews(t);
      relayout();
      ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(relayout); });
      ro.observe($('#labStage', root));
      root.addEventListener('submit', onSubmit);
      root.addEventListener('click', onClick);
      save();
    },
    unmount() {
      if (ro) ro.disconnect();
      if (root) { root.removeEventListener('submit', onSubmit); root.removeEventListener('click', onClick); }
      root = null; tab = null;
    },
    dispose(t) {
      const set = created.get(t.id);
      if (set) for (const d of set) send('tab:close', { id: vid(t, d) });
      created.delete(t.id);
    },
    reloadAll() {
      if (!tab) return;
      for (const d of created.get(tab.id) || []) send('tab:reload', { id: vid(tab, d) });
    },
    onState(m) {
      const p = parse(m.id);
      devLoading.set(m.id, !!m.loading);
      if (root) { const el = root.querySelector(`[data-load="${cssq(m.id)}"]`); if (el) el.classList.toggle('on', !!m.loading); }
      if (p && m.url && m.url !== 'about:blank') devUrl.set(m.id, m.url);
    },
    onNav(m) {
      const p = parse(m.id);
      if (!p || !p.tab || !m.ok || !/^https?:/i.test(m.url || '')) return;
      const L = cfg(p.tab);
      devUrl.set(m.id, m.url);
      if (!L.sync || m.url === L.url) return;
      L.url = m.url;
      navigateAll(p.tab, m.url, m.id);
      if (root && tab === p.tab) { const inp = root.querySelector('#labForm input'); if (inp && document.activeElement !== inp) inp.value = m.url; }
      save();
    },
  };

  function onSubmit(e) {
    e.preventDefault();
    const v = e.target.u.value.trim();
    if (!v) return;
    let url = toUrl(v);
    if (!url || isInternal(url)) return;
    const L = cfg(tab);
    const first = !L.url;
    L.url = url;
    if (first) { ensureViews(tab); relayout(); } else navigateAll(tab, url);
    e.target.u.blur();
    save();
  }

  function onClick(e) {
    const dev = e.target.closest('[data-ldev]');
    const L = cfg(tab);
    if (dev) {
      const d = dev.dataset.ldev;
      L.devs = L.devs.includes(d) ? L.devs.filter(x => x !== d) : L.devs.concat(d);
      dev.classList.toggle('on', L.devs.includes(d));
      ensureViews(tab); relayout(); save();
      return;
    }
    const a = e.target.closest('[data-lact]');
    if (!a) return;
    switch (a.dataset.lact) {
      case 'rot': L.rot = !L.rot; a.classList.toggle('on', L.rot); relayout(); break;
      case 'sync': L.sync = !L.sync; a.classList.toggle('on', L.sync); toast(L.sync ? 'Navegação sincronizada entre dispositivos.' : 'Cada dispositivo navega sozinho.'); break;
      case 'reload': Lab.reloadAll(); break;
      case 'open': if (L.url) newTab(L.url); break;
    }
    save();
  }
})();
PAGES.lab = Lab;
