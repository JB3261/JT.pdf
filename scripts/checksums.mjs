import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const releaseDir = path.resolve('release');
if (!fs.existsSync(releaseDir)) process.exit(0);

const exeFiles = fs
  .readdirSync(releaseDir)
  .filter((f) => f.toLowerCase().endsWith('.exe'))
  .sort();

const lines = exeFiles.map((file) => {
  const full = path.join(releaseDir, file);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  return `${hash}  ${file}`;
});

fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log('Generated release/SHA256SUMS.txt:\n' + lines.join('\n'));
