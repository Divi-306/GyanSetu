#!/usr/bin/env node
// One command to run GyanSetu locally: `npm run dev`
//
// Safe to run every time. Each step only does work when something is missing:
//   packages → env files & secrets → Docker → database → migrate → seed
//   → firewall (Windows) → API → Expo
//
// `npm run setup` does everything except starting the servers.
import fs from 'node:fs';
import path from 'node:path';
import {
  API_PORT, APP_DIR, BACKEND_DIR, addFirewallRule, bold, dbReady, depsOutdated, dim, dockerInstalled,
  dockerRunning, fail, firewallDeclinedMarker, firewallRuleExists, green, httpOk, isWin, killTree, lanAddresses,
  newSecret, nodeVersionOk, ok, portInUse, readEnv, run, setEnvValue, sleep, startProcess, step, warn, weakSecret,
  yellow,
} from './devkit.mjs';

const setupOnly = process.argv.includes('--setup-only');
// --skip-firewall: for CI or when you only use the emulator.
const skipFirewall = process.argv.includes('--skip-firewall');
const die = (msg, hint) => {
  fail(msg);
  if (hint) console.log(`  ${hint}`);
  console.log(`\n  Run ${bold('npm run doctor')} for a full check.\n`);
  process.exit(1);
};

console.log(bold('\nGyanSetu — local development\n'));

// ── 1. Node ──────────────────────────────────────────
if (!nodeVersionOk()) die(`Node ${process.versions.node} is too old.`, 'Install Node.js 20 or newer from https://nodejs.org');

// ── 2. Packages ──────────────────────────────────────
step('Packages');
for (const [label, dir] of [['App', APP_DIR], ['Backend', BACKEND_DIR]]) {
  if (depsOutdated(dir)) {
    console.log(dim(`  Installing ${label.toLowerCase()} packages (first run takes a few minutes)…`));
    if (!run('npm', ['install'], { cwd: dir }).ok) die(`${label} npm install failed.`);
  }
  ok(`${label} packages installed`);
}

// ── 3. Environment files ─────────────────────────────
step('Settings');
const backendEnv = path.join(BACKEND_DIR, '.env');
if (!fs.existsSync(backendEnv)) {
  fs.copyFileSync(path.join(BACKEND_DIR, '.env.example'), backendEnv);
  ok('Created backend/.env from .env.example');
}
let env = readEnv(backendEnv);
for (const key of ['JWT_ACCESS_SECRET', 'PACK_URL_SECRET']) {
  if (weakSecret(env[key])) {
    setEnvValue(backendEnv, key, newSecret());
    ok(`Generated a secure ${key}`);
  }
}
env = readEnv(backendEnv);
if (env.JWT_ACCESS_SECRET === env.PACK_URL_SECRET) setEnvValue(backendEnv, 'PACK_URL_SECRET', newSecret());
ok('backend/.env ready');

const providerKey = { groq: 'GROQ_API_KEY', xai: 'XAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }[env.AI_PROVIDER || 'groq'];
const aiReady = Boolean(env[providerKey]);
if (aiReady) ok(`Online AI enabled (${env.AI_PROVIDER || 'groq'})`);
else warn(`No ${providerKey} in backend/.env — the app uses offline AI answers. Optional: get a free key at https://console.groq.com/keys`);

// The app finds the API on its own ("auto"). Replace a stale hard-coded LAN IP.
const appEnv = path.join(APP_DIR, '.env.local');
const myIps = new Set(lanAddresses().map((a) => a.address));
const apiUrl = readEnv(appEnv)?.EXPO_PUBLIC_API_URL;
const staleIp = apiUrl && /^http:\/\/(\d+\.\d+\.\d+\.\d+):/.exec(apiUrl)?.[1];
if (!apiUrl) {
  fs.writeFileSync(appEnv, '# "auto" = the app finds the API on this PC automatically (development).\nEXPO_PUBLIC_API_URL=auto\n');
  ok('Created .env.local (API address: auto)');
} else if (staleIp && staleIp !== '10.0.2.2' && !staleIp.startsWith('127.') && !myIps.has(staleIp)) {
  setEnvValue(appEnv, 'EXPO_PUBLIC_API_URL', 'auto');
  ok(`.env.local pointed at an old IP (${staleIp}); switched to auto`);
} else ok(`App API address: ${apiUrl}`);

// ── 4. Docker + database ─────────────────────────────
step('Database');
if (!dockerInstalled()) die('Docker is not installed.', 'Install Docker Desktop: https://www.docker.com/products/docker-desktop — then run npm run dev again.');
if (!dockerRunning()) {
  const desktop = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
  if (isWin && fs.existsSync(desktop)) {
    console.log(dim('  Starting Docker Desktop…'));
    startProcess(desktop, []).unref();
  } else {
    console.log(dim('  Waiting for Docker to start — open Docker Desktop if it is closed…'));
  }
  for (let i = 0; i < 90 && !dockerRunning(); i++) await sleep(2000);
  if (!dockerRunning()) die('Docker is not running.', 'Open Docker Desktop, wait for "Engine running", then run npm run dev again.');
}
ok('Docker running');

if (!run('docker', ['compose', 'up', '-d', 'db'], { cwd: BACKEND_DIR, quiet: true }).ok) {
  die('Could not start the database container.', 'If port 5435 is used by another program, stop it and try again.');
}
for (let i = 0; i < 45 && !dbReady(); i++) await sleep(2000);
if (!dbReady()) die('The database did not become ready.', 'Check Docker Desktop for errors on the "db" container.');
ok('PostgreSQL ready (localhost:5435)');

if (!run('npm', ['run', 'migrate'], { cwd: BACKEND_DIR, quiet: true }).ok) die('Database migration failed (output above).');
ok('Tables up to date');
console.log(dim('  Loading sample courses (quick after the first run)…'));
if (!run('npm', ['run', 'seed'], { cwd: BACKEND_DIR, quiet: true }).ok) die('Loading sample data failed (output above).');
ok('Sample courses, quizzes and learning packs ready');

// ── 5. Firewall (Windows): let phones reach the PC ───
if (isWin && !skipFirewall) {
  step('Network access for phones');
  if (firewallRuleExists()) ok('Windows Firewall allows ports 4000 and 8081');
  else if (fs.existsSync(firewallDeclinedMarker)) {
    warn('Windows Firewall rule not added (skipped earlier). Phones may show "offline"; emulators are fine.');
    console.log(dim('  To add it: delete node_modules/.cache/gyansetu/firewall-declined and run npm run dev again.'));
  } else {
    console.log('  Phones need ports 4000 (API) and 8081 (Expo) open on this PC.');
    console.log(`  ${yellow('Windows will ask for permission — click Yes.')}`);
    if (addFirewallRule()) ok('Windows Firewall rule added');
    else {
      fs.mkdirSync(path.dirname(firewallDeclinedMarker), { recursive: true });
      fs.writeFileSync(firewallDeclinedMarker, new Date().toISOString());
      warn('Firewall rule not added. Phones may show "offline"; the Android emulator still works.');
    }
  }
}

if (setupOnly) {
  console.log(`\n${green(bold('Setup complete.'))} Start everything with ${bold('npm run dev')}.\n`);
  process.exit(0);
}

// ── 6. API ───────────────────────────────────────────
step('API server');
let api = null;
const apiLog = path.join(BACKEND_DIR, 'api.log');
if (await httpOk(`http://localhost:${API_PORT}/health`)) {
  ok(`API already running on port ${API_PORT} — using it`);
} else if (await portInUse(API_PORT)) {
  die(`Port ${API_PORT} is used by another program.`, `Close it (or the other terminal running the API) and run npm run dev again.`);
} else {
  fs.writeFileSync(apiLog, `--- ${new Date().toISOString()} ---\n`);
  api = startProcess('npm', ['run', 'dev'], { cwd: BACKEND_DIR, logFile: apiLog });
  let up = false;
  for (let i = 0; i < 60 && !(up = await httpOk(`http://localhost:${API_PORT}/health`)); i++) await sleep(1000);
  if (!up) {
    killTree(api);
    die('The API did not start.', `See ${path.relative(APP_DIR, apiLog)} for the error.`);
  }
  ok(`API running on port ${API_PORT} ${dim(`(logs: ${path.relative(APP_DIR, apiLog)})`)}`);
}

// ── 7. Expo ──────────────────────────────────────────
const ips = lanAddresses();
console.log(`\n${green(bold('Everything is ready.'))}`);
console.log(`  • API:   http://localhost:${API_PORT}${ips[0] ? `  and  http://${ips[0].address}:${API_PORT}` : ''}`);
console.log('  • Phone: connect it to the same Wi-Fi as this PC, open Expo Go and scan the QR code below.');
console.log('  • Emulator: press a after the QR code appears.');
console.log(`  • Problems? Run ${bold('npm run doctor')} in another terminal.\n`);

const expo = startProcess('npx', ['expo', 'start', '--clear']);
const stopAll = () => {
  killTree(api);
  killTree(expo);
};
process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
process.on('SIGTERM', stopAll);
expo.on('exit', (code) => {
  killTree(api);
  process.exit(code ?? 0);
});
