#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { ManifestSchema } = require('./schema');
const {
  listAvailablePackages,
  listInstalledPackages,
  install,
  uninstall,
} = require('./registry');

function usage() {
  console.log(`
Brad Bot Store (local)

Usage:
  botstore list
  botstore installed
  botstore info <name>
  botstore install <name>
  botstore uninstall <name>
  botstore build-catalog

Notes:
- Install does not execute scripts.
- Packages live in ./packages
- Installed copies live in ./installed
`);
}

function loadManifestFromDir(dir) {
  const p = path.join(dir, 'manifest.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return ManifestSchema.parse(raw);
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    usage();
    process.exit(0);
  }

  if (cmd === 'list') {
    const pkgs = listAvailablePackages();
    for (const p of pkgs) {
      const m = ManifestSchema.parse(p.manifest);
      console.log(`${m.name}@${m.version} — ${m.displayName}`);
    }
    return;
  }

  if (cmd === 'installed') {
    const pkgs = listInstalledPackages();
    for (const p of pkgs) {
      const m = ManifestSchema.parse(p.manifest);
      console.log(`${m.name}@${m.version} — ${m.displayName}`);
    }
    return;
  }

  if (cmd === 'info') {
    const name = args[1];
    if (!name) throw new Error('Missing package name');
    const p = listAvailablePackages().find((x) => x.name === name);
    if (!p) throw new Error(`Package not found: ${name}`);
    const m = ManifestSchema.parse(p.manifest);
    console.log(JSON.stringify(m, null, 2));
    return;
  }

  if (cmd === 'install') {
    const name = args[1];
    if (!name) throw new Error('Missing package name');
    const p = listAvailablePackages().find((x) => x.name === name);
    if (!p) throw new Error(`Package not found: ${name}`);
    const m = ManifestSchema.parse(p.manifest);
    console.log('Permissions requested:');
    console.log(JSON.stringify(m.permissions, null, 2));
    const r = install(name);
    console.log(r.installed ? 'Installed.' : `Skipped (${r.reason}).`);
    return;
  }

  if (cmd === 'uninstall') {
    const name = args[1];
    if (!name) throw new Error('Missing package name');
    const r = uninstall(name);
    console.log(r.removed ? 'Removed.' : `Skipped (${r.reason}).`);
    return;
  }

  if (cmd === 'build-catalog') {
    const pkgs = listAvailablePackages().map((p) => ManifestSchema.parse(p.manifest));
    const outDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify({ generatedAt: new Date().toISOString(), packages: pkgs }, null, 2));
    console.log('Wrote public/catalog.json');
    return;
  }

  usage();
  process.exit(1);
}

main();
