const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_ROOT = path.join(__dirname, '..');
const PACKAGES_DIR = path.join(STORE_ROOT, 'packages');
const INSTALLED_DIR = path.join(STORE_ROOT, 'installed');

function ensureDirs() {
  if (!fs.existsSync(PACKAGES_DIR)) fs.mkdirSync(PACKAGES_DIR, { recursive: true });
  if (!fs.existsSync(INSTALLED_DIR)) fs.mkdirSync(INSTALLED_DIR, { recursive: true });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function sha256File(p) {
  const b = fs.readFileSync(p);
  return crypto.createHash('sha256').update(b).digest('hex');
}

function listAvailablePackages() {
  ensureDirs();
  const dirs = fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  return dirs
    .map((name) => {
      const manifestPath = path.join(PACKAGES_DIR, name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) return null;
      const manifest = readJson(manifestPath);
      return { name, manifest, path: path.join(PACKAGES_DIR, name) };
    })
    .filter(Boolean);
}

function listInstalledPackages() {
  ensureDirs();
  const dirs = fs
    .readdirSync(INSTALLED_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  return dirs
    .map((name) => {
      const manifestPath = path.join(INSTALLED_DIR, name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) return null;
      const manifest = readJson(manifestPath);
      return { name, manifest, path: path.join(INSTALLED_DIR, name) };
    })
    .filter(Boolean);
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function install(name) {
  ensureDirs();
  const src = path.join(PACKAGES_DIR, name);
  if (!fs.existsSync(src)) throw new Error(`Package not found: ${name}`);
  const dest = path.join(INSTALLED_DIR, name);
  if (fs.existsSync(dest)) return { installed: false, reason: 'already-installed' };
  copyDir(src, dest);
  return { installed: true };
}

function uninstall(name) {
  ensureDirs();
  const dest = path.join(INSTALLED_DIR, name);
  if (!fs.existsSync(dest)) return { removed: false, reason: 'not-installed' };
  fs.rmSync(dest, { recursive: true, force: true });
  return { removed: true };
}

module.exports = {
  STORE_ROOT,
  PACKAGES_DIR,
  INSTALLED_DIR,
  listAvailablePackages,
  listInstalledPackages,
  install,
  uninstall,
  sha256File,
};
