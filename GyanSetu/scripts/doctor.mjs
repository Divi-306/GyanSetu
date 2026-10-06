#!/usr/bin/env node
// `npm run doctor` — checks every piece GyanSetu needs locally and explains how
// to fix what's wrong. It never changes anything; `npm run dev` does the fixing.
import fs from 'node:fs';
import path from 'node:path';
import {
  API_PORT, APP_DIR, BACKEND_DIR, bold, dbReady, depsOutdated, dim, dockerInstalled, dockerRunning, fail,
  firewallRuleExists, httpOk, isWin, lanAddresses, nodeVersionOk, ok, readEnv, warn, weakSecret,
} from './devkit.mjs';

let problems = 0;
const bad = (msg, fix) => {
  problems++;
  fail(msg);
  if (fix) console.log(`  ${dim('fix:')} ${fix}`);
};

console.log(bold('\nGyanSetu doctor\n'));

// Tools
if (nodeVersionOk()) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} is too old`, 'install Node.js 20+ from https://nodejs.org');

for (const [label, dir] of [['App', APP_DIR], ['Backend', BACKEND_DIR]]) {
  if (depsOutdated(dir)) bad(`${label} packages missing or out of date`, 'run npm run dev (it installs them)');
  else ok(`${label} packages installed`);
}

// Settings
const env = readEnv(path.join(BACKEND_DIR, '.env'));
if (!env) bad('backend/.env is missing', 'run npm run dev (it creates it)');
else {
  if (weakSecret(env.JWT_ACCESS_SECRET) || weakSecret(env.PACK_URL_SECRET)) bad('backend/.env has placeholder secrets', 'run npm run dev (it generates them)');
  else ok('backend/.env secrets set');
  const key = { groq: 'GROQ_API_KEY', xai: 'XAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }[env.AI_PROVIDER || 'groq'];
  if (env[key]) ok(`Online AI key set (${env.AI_PROVIDER || 'groq'})`);
  else warn(`No ${key}: online AI is off, offline answers still work (optional)`);
}

const ips = lanAddresses();
const apiUrl = readEnv(path.join(APP_DIR, '.env.local'))?.EXPO_PUBLIC_API_URL;
if (!apiUrl) bad('.env.local is missing', 'run npm run dev (it creates it with EXPO_PUBLIC_API_URL=auto)');
else if (apiUrl === 'auto') ok('App finds the API automatically (EXPO_PUBLIC_API_URL=auto)');
else {
  const ip = /^http:\/\/(\d+\.\d+\.\d+\.\d+):/.exec(apiUrl)?.[1];
  if (ip && ip !== '10.0.2.2' && !ip.startsWith('127.') && !ips.some((a) => a.address === ip)) {
    bad(`App points at ${apiUrl}, but this PC's IP is ${ips[0]?.address ?? 'unknown'}`, 'set EXPO_PUBLIC_API_URL=auto in .env.local, then restart Expo with --clear');
  } else ok(`App API address: ${apiUrl}`);
}

// Docker & database
if (!dockerInstalled()) bad('Docker is not installed', 'install Docker Desktop: https://www.docker.com/products/docker-desktop');
else if (!dockerRunning()) bad('Docker is not running', 'open Docker Desktop and wait for "Engine running"');
else {
  ok('Docker running');
  if (dbReady()) ok('Database container ready');
  else bad('Database container is not running', 'run npm run dev (it starts it)');
}

// API reachability: the checks that explain "You are offline" in the app
const local = await httpOk(`http://localhost:${API_PORT}/health`);
if (local) ok(`API answers on http://localhost:${API_PORT}`);
else bad(`API is not running on port ${API_PORT}`, 'run npm run dev, and keep that terminal open');

if (ips.length === 0) bad('This PC has no network address', 'connect it to Wi-Fi (the same network as the phone)');
for (const { name, address } of ips) {
  const url = `http://${address}:${API_PORT}/health`;
  if (!local) console.log(`  ${dim('·')} ${name}: ${address}`);
  else if (await httpOk(url)) ok(`API reachable at ${address} (${name})`);
  else bad(`API not reachable at ${address} (${name})`, 'restart the API with npm run dev');
}

if (isWin) {
  if (firewallRuleExists()) ok('Windows Firewall allows phones (ports 4000 and 8081)');
  else bad('Windows Firewall may block phones (no GyanSetu rule)', 'run npm run dev and click Yes on the Windows prompt');
}

// Summary
console.log();
if (problems === 0) {
  console.log(bold('No problems found.'));
  if (ips[0]) {
    console.log(`If a phone still shows "offline": open ${bold(`http://${ips[0].address}:${API_PORT}/health`)} in the phone's browser.`);
    console.log("  • It loads → close Expo Go completely and reopen the project.");
    console.log("  • It doesn't load → the phone isn't on the same network as this PC (or the Wi-Fi blocks devices from talking to each other, common on public/college Wi-Fi; use a phone hotspot instead).");
  }
} else {
  console.log(bold(`${problems} problem${problems === 1 ? '' : 's'} found — see the fixes above.`));
}
console.log();
process.exit(problems ? 1 : 0);
