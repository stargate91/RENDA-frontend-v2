import { spawn } from 'child_process';
import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const isWindowsBinary = electronPath.toLowerCase().endsWith('.exe');
const isWindowsHost = process.platform === 'win32';

function forwardChildLifecycle(child, executable) {
  child.on('close', (code, signal) => {
    if (code === null) {
      console.error(`${executable} exited with signal ${signal}`);
      process.exit(1);
    }
    process.exit(code);
  });

  for (const event of ['SIGINT', 'SIGTERM', 'SIGUSR2']) {
    process.on(event, () => {
      if (!child.killed) {
        child.kill(event);
      }
    });
  }

  return child;
}

if (isWindowsBinary && !isWindowsHost) {
  const relativeElectronPath = path.relative(process.cwd(), electronPath);
  const hasWindowsInterop = fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop');
  const windowsShells = [
    '/mnt/C/Windows/System32/cmd.exe',
    '/mnt/C/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  ].filter((candidate) => fs.existsSync(candidate));

  const guidance = hasWindowsInterop && windowsShells.length > 0
    ? 'Run npm run dev from a Windows shell for this install, or delete frontend/node_modules and reinstall inside WSL.'
    : 'Delete frontend/node_modules and reinstall inside this Linux/WSL environment, or run npm run dev from a Windows shell with its own install.';

  console.error(
    [
      'Electron is installed for Windows, but this shell cannot execute Windows Electron binaries.',
      `Resolved binary: ${relativeElectronPath}`,
      guidance,
    ].join('\n')
  );
  process.exit(1);
}

forwardChildLifecycle(
  spawn(electronPath, process.argv.slice(2), {
    stdio: 'inherit',
    windowsHide: false,
  }),
  electronPath
);
