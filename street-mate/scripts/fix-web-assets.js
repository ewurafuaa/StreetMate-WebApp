/* global __dirname */
// Fixes the web build so it deploys cleanly to Netlify (especially drag-and-drop):
//  1. Netlify skips any folder named "node_modules". Expo puts icon fonts and a few images under
//     dist/assets/node_modules/..., so after deploying every icon is an empty square.
//     That folder is renamed to "vendor" and every reference to it is rewritten.
//  2. The icon fonts then sit under a deep path containing "@expo/...". To be safe on any host, the
//     font files are moved to a plain, short folder: dist/assets/fonts/.
const fs = require('fs');
const path = require('path');

const dist = path.resolve(__dirname, '..', 'dist');
const assets = path.join(dist, 'assets');
const nodeModules = path.join(assets, 'node_modules');
const vendor = path.join(assets, 'vendor');
const fontsOut = path.join(assets, 'fonts');

const TEXT_FILE = /\.(js|html|css|json|map)$/;

function rewriteAll(replacer) {
  let changed = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (TEXT_FILE.test(entry.name)) {
        const before = fs.readFileSync(full, 'utf8');
        const after = replacer(before);
        if (after !== before) {
          fs.writeFileSync(full, after);
          changed++;
        }
      }
    }
  };
  walk(dist);
  return changed;
}

function findDir(root, name) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    if (entry.name === name) return full;
    const inner = findDir(full, name);
    if (inner) return inner;
  }
  return null;
}

// Step 1: node_modules -> vendor
if (fs.existsSync(nodeModules)) {
  fs.renameSync(nodeModules, vendor);
  const n = rewriteAll((t) => t.split('assets/node_modules').join('assets/vendor'));
  console.log(`fix-web-assets: renamed assets/node_modules to assets/vendor (${n} file(s) updated).`);
}

// Step 2: flatten the icon fonts into assets/fonts
if (fs.existsSync(vendor)) {
  const fontsDir = findDir(vendor, 'Fonts');
  if (fontsDir) {
    fs.mkdirSync(fontsOut, { recursive: true });
    let moved = 0;
    for (const file of fs.readdirSync(fontsDir)) {
      fs.renameSync(path.join(fontsDir, file), path.join(fontsOut, file));
      moved++;
    }
    // "@" may appear as-is or URL-encoded as %40 inside the bundle.
    const prefix = /assets\/vendor\/(?:@|%40)expo\/vector-icons\/build\/vendor\/react-native-vector-icons\/Fonts\//g;
    const n = rewriteAll((t) => t.replace(prefix, 'assets/fonts/'));
    console.log(`fix-web-assets: moved ${moved} font file(s) to assets/fonts (${n} file(s) updated).`);
  } else {
    console.log('fix-web-assets: no Fonts folder found under assets/vendor.');
  }
}