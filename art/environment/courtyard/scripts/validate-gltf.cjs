// Pass an external gltf-validator installation; no game dependency is added.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const validator = require(process.argv[2] || 'gltf-validator');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

(async () => {
  const assets = [];
  for (const asset of manifest.assets) {
    const bytes = fs.readFileSync(path.join(root, asset.file));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Re-export ${asset.id}`);
    const report = await validator.validateBytes(new Uint8Array(bytes), {
      uri: asset.file,
      maxIssues: 100,
    });
    assets.push({ id: asset.id, sha256: asset.sha256, validatorVersion: report.validatorVersion, issues: report.issues });
    console.log(asset.id, JSON.stringify(report.issues));
  }
  fs.writeFileSync(path.join(root, 'gltf-validation.json'), JSON.stringify({ assets }, null, 2) + '\n');
  if (assets.some(asset => asset.issues.numErrors || asset.issues.numWarnings)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
