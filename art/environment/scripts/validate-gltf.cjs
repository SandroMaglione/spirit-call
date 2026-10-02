// Run with a kit directory and an external gltf-validator installation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2]);
const validator = require(process.argv[3] || 'gltf-validator');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
(async () => {
  const assets = [];
  for (const asset of manifest.assets) {
    const bytes = fs.readFileSync(path.join(root, asset.file));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Hash mismatch: ${asset.id}`);
    const result = await validator.validateBytes(new Uint8Array(bytes), { uri: asset.file, maxIssues: 100 });
    assets.push({ id: asset.id, sha256: asset.sha256, validatorVersion: result.validatorVersion, issues: result.issues });
  }
  fs.writeFileSync(path.join(root, 'gltf-validation.json'), JSON.stringify({ assets }, null, 2) + '\n');
  const failures = assets.filter(a => a.issues.numErrors || a.issues.numWarnings);
  console.log(manifest.kit, assets.length, 'GLBs;', failures.length, 'failures');
  if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
})().catch(error => { console.error(error); process.exitCode = 1; });
