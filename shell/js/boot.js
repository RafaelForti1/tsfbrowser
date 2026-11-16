/* TSF Browser — inicialização do shell. */
'use strict';

$('#brandLogo').innerHTML = LOGO;
[['#btnBack', 'back'], ['#btnFwd', 'forward'], ['#btnReload', 'reload'], ['#btnHome', 'home'], ['#btnHistory', 'clock'], ['#btnDev', 'code'],
 ['#btnPanel', 'panel'], ['#btnMenu', 'more'], ['#btnSettings', 'gear'], ['#btnDownloads', 'download'], ['#btnPanelClose', 'x'],
 ['#btnSplit', 'columns'], ['#btnInspector', 'activity'], ['#btnAtmo', 'sun'],
 ['#wMin', 'min'], ['#wMax', 'max'], ['#wClose', 'close']].forEach(([s, i]) => { $(s).innerHTML = icon(i); });
$('#aiSend').innerHTML = icon('send', 'sm');
$$('.side-head .mini').forEach(b => { b.innerHTML = icon('plus'); });

// Luz que acompanha o cursor nas superfícies de vidro (--mx/--my).
const LIT = '.card, .tile, .tool-card, .tm-card, .lh-card, .atmo-card, .set-card';
let litRaf = 0, litEv = null;
document.addEventListener('pointermove', e => {
  litEv = e;
  if (litRaf) return;
  litRaf = requestAnimationFrame(() => {
    litRaf = 0;
    const el = litEv.target.closest && litEv.target.closest(LIT);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (litEv.clientX - r.left) + 'px');
    el.style.setProperty('--my', (litEv.clientY - r.top) + 'px');
  });
}, { passive: true });

if (host) {
  host.addEventListener('message', e => onHost(e.data));
  send('ready', { keys: Object.keys(KEYMAP) });
} else {
  // Pré-visualização em um navegador comum (sem o host nativo)
  init({ version: 'preview', engine: '—' });
}
