# TSF Browser

Navegador desktop para Windows, para desenvolvedores. **Electron + TypeScript**, motor Chromium,
interface *Dark Futuristic* com vidro translúcido. Baseado em [nexus-browser-proposta.md](nexus-browser-proposta.md).

## Rodar e empacotar

```powershell
npm install          # usa o espelho definido em .npmrc (registry.npmjs.org está bloqueado nesta rede)
npm start            # compila o processo principal e abre o navegador
npm run dev          # igual, com TSF_DEBUG=1 (DevTools da interface + log em debug.log)
npm run dist         # gera release\TSFBrowser-Setup-<versão>.exe (instalador NSIS por usuário, sem admin)
```

### Publicar uma versão (atualização automática)

1. Suba a versão em `package.json` (ex.: `0.4.0` → `0.4.1`).
2. Com a variável `GH_TOKEN` definida (token *fine-grained* com **Contents: Read and write** no repositório),
   rode `npm run release`. O instalador e o `latest.yml` vão para o GitHub Releases.
3. Os navegadores instalados verificam ao abrir e a cada 4 horas, baixam em segundo plano e mostram
   **"Atualização x.y.z · Reiniciar"** no rodapé (ou instalam ao fechar).

> Se `npm install` não baixar o Electron (npm 11 bloqueia scripts de instalação), rode
> `node node_modules\electron\install.js`.

## Estrutura

| Pasta | Papel |
|---|---|
| `electron/main.ts` | Processo principal: janela, um `WebContentsView` por aba/dispositivo, partições por workspace, permissões, CDP (Inspector), miniaturas, portas do Localhost |
| `electron/preload.ts` | Ponte mínima (`window.tsfHost`): só `postMessage`/`addEventListener` |
| `shell/` | Toda a interface (HTML/CSS/JS), servida pelo protocolo `tsf-shell://` |
| `shell/glass.css` | Camada de vidro: brilho especular, borda gradiente, granulação, luz que segue o cursor |
| `legacy/webview2/` | Versão anterior em C# + WebView2 (só referência) |

O shell envia um **layout** (lista de retângulos) e o processo principal posiciona as views nativas,
por isso Split View e Responsive Lab mostram várias páginas reais ao mesmo tempo.

**Segurança:** `contextIsolation` + `sandbox` em tudo, sem `nodeIntegration`; páginas web não têm preload;
câmera, microfone, localização e notificações pedem confirmação; o shell não navega nem abre janelas.

**Vidro do sistema:** no Windows 11 22H2+ a janela usa o material Acrylic (a área de trabalho aparece
desfocada atrás). Em versões anteriores o vidro é simulado na interface. Opção em Configurações.

Dados em `%LOCALAPPDATA%\TSFBrowser` (`state.json`, `history.json`, `sessions.json`, `thumbs\`, `Electron\`).

## Recursos

| Recurso | Atalho |
|---|---|
| Command Center | Ctrl+K |
| Workspaces (perfis isolados) | Alt+1…9 |
| Início / Voltar | Alt+Home / Alt+← |
| Split View | Ctrl+Shift+D ou Ctrl+clique numa aba |
| TSF Universe | Ctrl+Shift+U |
| Time Machine | Ctrl+Shift+H |
| Responsive Lab | Ctrl+Shift+L |
| Localhost | Ctrl+Shift+O |
| TSF Inspector | Ctrl+Shift+E |
| TSF Atmosphere | Ctrl+Shift+M |
| Modo foco / Sidebar / Painel | Ctrl+Shift+F / Ctrl+B / Ctrl+Shift+A |
| DevTools | F12 |

### Modo de teste
`TSF_DEBUG=1`, `TSF_DATA=<pasta>` (dados separados) e
`--run="url:example.com;wait:3000;cmd:splitView;type:wikipedia.org;enter"` roda um roteiro automático.
