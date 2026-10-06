// Shared helpers for `npm run dev` and `npm run doctor`. Node built-ins only.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BACKEND_DIR = path.join(APP_DIR, 'backend');
export const isWin = process.platform === 'win32';
export const API_PORT = 4000;
export const EXPO_PORT = 8081;
export const FIREWALL_RULE = 'GyanSetu Dev (API + Expo)';
const CACHE_DIR = path.join(APP_DIR, 'node_modules', '.cache', 'gyansetu');

// ── Output ──────────────────────────────────────────
const c = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
export const green = c(32);
export const yellow = c(33);
export const red = c(31);
export const bold = c(1);
export const dim = c(2);

export const ok = (msg) => console.log(`${green('✔')} ${msg}`);
export const warn = (msg) => console.log(`${yellow('!')} ${msg}`);
export const fail = (msg) => console.log(`${red('✖')} ${msg}`);
export const step = (msg) => console.log(`\n${bold('▸ ' + msg)}`);

// ── Processes ───────────────────────────────────────
// On Windows, npm/npx are .cmd scripts and need a shell. Everything else
// (docker, netsh, powershell) runs directly. For the shell case we pass one
// quoted command string, since Node deprecates shell + an argument list.
const quote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

function spawnArgs(cmd, args) {
  if (isWin && /^(npm|npx)$/.test(cmd)) return { file: [cmd, ...args].map(quote).join(' '), argv: [], shell: true };
  return { file: cmd, argv: args, shell: false };
}

/** Runs a command and waits. `quiet` hides output unless it fails. */
export function run(cmd, args, { cwd = APP_DIR, quiet = false } = {}) {
  const s = spawnArgs(cmd, args);
  const res = spawnSync(s.file, s.argv, {
    cwd,
    shell: s.shell,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
  });
  if (quiet && res.status !== 0) {
    process.stdout.write(res.stdout ?? '');
    process.stderr.write(res.stderr ?? '');
  }
  return { ok: res.status === 0, stdout: res.stdout ?? '', stderr: res.stderr ?? '', status: res.status };
}

/** True if the command exists and exits successfully. */
export function succeeds(cmd, args, cwd = APP_DIR) {
  const s = spawnArgs(cmd, args);
  return spawnSync(s.file, s.argv, { cwd, shell: s.shell, stdio: 'ignore' }).status === 0;
}

/** Starts a long-running process; returns the child. */
export function startProcess(cmd, args, { cwd = APP_DIR, logFile } = {}) {
  const out = logFile ? fs.openSync(logFile, 'a') : 'inherit';
  const s = spawnArgs(cmd, args);
  return spawn(s.file, s.argv, {
    cwd,
    shell: s.shell,
    stdio: logFile ? ['ignore', out, out] : 'inherit',
    detached: !isWin, // lets us kill the whole process group on macOS/Linux
  });
}

/** Stops a child and everything it started (npm → tsx → node). */
export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Network ─────────────────────────────────────────
const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Loopback|vbox|virbr|docker|br-|utun|awdl/i;

/** The PC's real network addresses (Wi-Fi / Ethernet / hotspot), best first. */
export function lanAddresses() {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      list.push({ name, address: a.address });
    }
  }
  const score = (n) => (/wi-?fi|wlan|wireless/i.test(n) ? 0 : /ethernet|eth|en\d/i.test(n) ? 1 : 2);
  return list.sort((a, b) => score(a.name) - score(b.name));
}

/** GET url; resolves true for a 2xx answer within the timeout. */
export function httpOk(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 300);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

/** True if something is already listening on the port. */
export function portInUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(true));
    srv.once('listening', () => srv.close(() => resolve(false)));
    srv.listen(port, '0.0.0.0');
  });
}

// ── .env files ──────────────────────────────────────
export function readEnv(file) {
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/** Sets KEY=value in an env file, keeping comments and other lines. */
export function setEnvValue(file, key, value) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\s*$/, '\n')}${key}=${value}\n`;
  fs.writeFileSync(file, text);
}

export const newSecret = () => crypto.randomBytes(48).toString('base64url');

/** Placeholder or too-short secrets are not acceptable, even in development. */
export const weakSecret = (v) => !v || v.startsWith('change-me') || v.length < 32;

// ── Docker ──────────────────────────────────────────
export const dockerInstalled = () => succeeds('docker', ['--version']);
export const dockerRunning = () => succeeds('docker', ['info']);

export function dbReady() {
  return succeeds('docker', ['compose', 'exec', '-T', 'db', 'pg_isready', '-U', 'gyansetu'], BACKEND_DIR);
}

// ── Windows firewall ────────────────────────────────
export function firewallRuleExists() {
  if (!isWin) return true;
  return succeeds('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE}`]);
}

/** Opens ports 4000 (API) and 8081 (Expo) for phones. Shows one Windows permission prompt. */
export function addFirewallRule() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const ps1 = path.join(CACHE_DIR, 'firewall.ps1');
  fs.writeFileSync(
    ps1,
    `$ruleArgs = 'advfirewall firewall add rule name="${FIREWALL_RULE}" dir=in action=allow protocol=TCP localport=${API_PORT},${EXPO_PORT} profile=any'\n` +
      `Start-Process -FilePath netsh -ArgumentList $ruleArgs -Verb RunAs -Wait -WindowStyle Hidden\n`,
  );
  run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { quiet: true });
  return firewallRuleExists();
}

export const firewallDeclinedMarker = path.join(CACHE_DIR, 'firewall-declined');

// ── Dependencies ────────────────────────────────────
/** node_modules missing, or package-lock.json changed since the last install (e.g. after git pull). */
export function depsOutdated(dir) {
  const nm = path.join(dir, 'node_modules', '.package-lock.json');
  const lock = path.join(dir, 'package-lock.json');
  if (!fs.existsSync(nm)) return true;
  return fs.existsSync(lock) && fs.statSync(lock).mtimeMs > fs.statSync(nm).mtimeMs;
}

export function nodeVersionOk() {
  return Number(process.versions.node.split('.')[0]) >= 20;
}
