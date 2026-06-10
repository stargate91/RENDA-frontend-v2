import { execFileSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import waitOn from 'wait-on';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const windowsShell = process.env.ComSpec || 'cmd.exe';

const children = new Set();
let shuttingDown = false;

function stopChild(child, label) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    if (isWindows) {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }

    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      console.warn(`[dev-runner] Failed to stop ${label}`);
    }
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    stopChild(child.process, child.label);
  }

  setTimeout(() => process.exit(exitCode), 250);
}

function spawnManaged(label, command, args, options = {}) {
  const useWindowsCmd = isWindows && /\.(cmd|bat)$/i.test(command);
  const spawnCommand = useWindowsCmd ? windowsShell : command;
  const spawnArgs = useWindowsCmd ? ['/d', '/s', '/c', command, ...args] : args;

  const child = spawn(spawnCommand, spawnArgs, {
    cwd: options.cwd || __dirname,
    stdio: 'inherit',
    shell: false,
    detached: !isWindows,
    windowsHide: false,
  });

  const entry = { label, process: child };
  children.add(entry);

  child.on('exit', (code, signal) => {
    children.delete(entry);

    if (shuttingDown) {
      return;
    }

    const normalizedCode = typeof code === 'number' ? code : (signal ? 1 : 0);
    if (label === 'electron') {
      shutdown(normalizedCode);
      return;
    }

    console.error(`[dev-runner] ${label} exited unexpectedly`, { code, signal });
    shutdown(normalizedCode || 1);
  });

  child.on('error', (error) => {
    console.error(`[dev-runner] Failed to start ${label}`, error);
    shutdown(1);
  });

  return child;
}

for (const event of ['SIGINT', 'SIGTERM', 'SIGUSR2']) {
  process.on(event, () => shutdown(0));
}

const backend = spawnManaged('backend', 'python', ['-m', 'app.api.main'], {
  cwd: projectRoot,
});

const vite = spawnManaged('vite', npmCommand, ['run', 'vite'], {
  cwd: __dirname,
});

try {
  await waitOn({
    resources: ['http://localhost:5173'],
    timeout: 30000,
    validateStatus: (status) => status >= 200 && status < 500,
  });
} catch (error) {
  console.error('[dev-runner] Timed out waiting for Vite dev server', error);
  shutdown(1);
}

if (!shuttingDown) {
  spawnManaged('electron', process.execPath, ['start-electron.js', '.'], {
    cwd: __dirname,
  });
}
