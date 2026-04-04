import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'node_modules', 'cesium', 'Build', 'Cesium');
const targetRoot = path.join(projectRoot, 'public', 'cesium');
const assetDirs = ['Assets', 'ThirdParty', 'Widgets', 'Workers'];

function copyRecursive(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

if (!fs.existsSync(sourceRoot)) {
  process.exit(0);
}

for (const dir of assetDirs) {
  copyRecursive(path.join(sourceRoot, dir), path.join(targetRoot, dir));
}
