import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webRoot = join(__dirname, '..');

const targets = [
  'node_modules/@near-wallet-selector/meteor-wallet/node_modules/@meteorwallet/sdk/dist/index.cjs',
  'node_modules/@near-wallet-selector/meteor-wallet/node_modules/@meteorwallet/sdk/dist/index.js',
  'node_modules/@near-wallet-selector/meteor-wallet/node_modules/@meteorwallet/sdk/src/MeteorWallet.ts',
  'node_modules/@near-wallet-selector/meteor-wallet/node_modules/@meteorwallet/sdk/src/postMessage/MeteorPostMessenger.ts',
];

const logPatterns = [
  /^\s*console\.log\("No extension found\. Need to connect to web popup for Meteor communication"\);\n\n?/m,
  /^\s*console\.log\(accessKey\);\n\n?/m,
  /^\s*console\.log\("Transformed transactions", transformedTransactions\);\n\n?/m,
  /^\s*console\.log\("Comparing access key and actions", \{\n\s*accessKey,\n\s*receiverId,\n\s*actions\n\s*\}\);\n\n?/m,
  /^\s*console\.log\(firstAction\);\n\n?/m,
  /^\s*console\.log\("accessKeys", accessKeys\);\n\n?/m,
];

function patchSource(normalized) {
  let next = normalized;

  for (const pattern of logPatterns) {
    next = next.replace(pattern, '');
  }

  next = next.replace(
    /\n([ \t]*)\} else \{\n\1\}\n([ \t]*)\} else \{/g,
    '\n$1}\n$2} else {',
  );

  next = next.replace(
    /([ \t]*)if \(this\.comWindow\.isWindowClosed\(\)\) if \(this\.comWindow\.wasOpened\) \{([\s\S]*?)\n\1\} else console\.log\("Window is closed, need to allow popup"\);\n([ \t]*)else \{/g,
    '$1if (this.comWindow.isWindowClosed()) {\n$1\tif (this.comWindow.wasOpened) {$2\n$1\t}\n$3} else {',
  );

  return next;
}

let changedFiles = 0;

for (const relativePath of targets) {
  const absolutePath = join(webRoot, relativePath);
  if (!existsSync(absolutePath)) {
    continue;
  }

  const original = readFileSync(absolutePath, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const normalized = original.replace(/\r\n/g, '\n');
  const patched = patchSource(normalized);

  if (patched !== normalized) {
    writeFileSync(absolutePath, patched.replace(/\n/g, eol));
    changedFiles += 1;
  }
}

console.log(`[postinstall] Meteor wallet patch ensured for ${changedFiles} file(s).`);
