// Abre o TSF Browser em modo de desenvolvimento.
// Remove ELECTRON_RUN_AS_NODE (definida por apps Electron como o VS Code), que faria o Electron rodar como Node puro.
const { spawn } = require('node:child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (process.argv.includes('--debug')) env.TSF_DEBUG = '1';

const child = spawn(electron, ['.', ...process.argv.slice(2).filter(a => a !== '--debug')], { stdio: 'inherit', env });
child.on('exit', code => process.exit(code ?? 0));
