// Starts the API and the web dev server side by side (works on Windows, macOS and Linux).
// Usage: npm run dev
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';

/** @type {{ name: string, color: string, workspace: string }[]} */
const apps = [
  { name: 'api', color: '\x1b[35m', workspace: 'apps/api' },
  { name: 'web', color: '\x1b[36m', workspace: 'apps/web' },
];

const reset = '\x1b[0m';
const children = [];
let shuttingDown = false;

/**
 * Prefixes every line of a child stream with the app name.
 * @param {NodeJS.ReadableStream} stream
 * @param {NodeJS.WriteStream} out
 * @param {string} prefix
 */
function pipeWithPrefix(stream, out, prefix) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) out.write(`${prefix} ${line}\n`);
  });
  stream.on('end', () => {
    if (buffer) out.write(`${prefix} ${buffer}\n`);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  setTimeout(() => process.exit(code), 500).unref();
}

for (const app of apps) {
  // On Windows, npm is a .cmd file and needs a shell to run.
  const child = spawn('npm', ['run', 'dev', '-w', app.workspace], {
    shell: isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  const prefix = `${app.color}[${app.name}]${reset}`;
  pipeWithPrefix(child.stdout, process.stdout, prefix);
  pipeWithPrefix(child.stderr, process.stderr, prefix);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${prefix} saiu com código ${code}. Encerrando os outros processos...`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
