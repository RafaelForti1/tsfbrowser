// Ponte mínima e explícita entre a interface (shell) e o processo principal.
// Expõe apenas postMessage/addEventListener — nenhuma API do Node ou do Electron vaza para a página.
import { contextBridge, ipcRenderer } from 'electron';

type Listener = (e: { data: unknown }) => void;
const listeners = new Set<Listener>();

ipcRenderer.on('host', (_e, msg) => {
  for (const l of listeners) {
    try { l({ data: msg }); } catch (err) { console.error(err); }
  }
});

contextBridge.exposeInMainWorld('tsfHost', {
  postMessage: (msg: unknown) => ipcRenderer.send('shell', msg),
  addEventListener: (type: string, cb: Listener) => { if (type === 'message' && typeof cb === 'function') listeners.add(cb); },
});
