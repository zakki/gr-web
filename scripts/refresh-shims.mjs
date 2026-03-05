import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const tscPath = resolve(root, 'node_modules/.bin/tsc');
const run = spawnSync(tscPath, ['-p', 'tsconfig.json', '--noEmit', '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
});
const out = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
const re = /Cannot find name '([^']+)'/g;
const raw = new Set();
for (const m of out.matchAll(re)) raw.add(m[1]);

const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;
const keywords = new Set([
  'break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','finally','for','function','if','import','in','instanceof','new','return','super','switch','this','throw','try','typeof','var','void','while','with','yield','let','static','enum','await','implements','package','protected','interface','private','public','null','true','false','constructor',
]);

const names = [...raw].filter((n) => ident.test(n) && !keywords.has(n)).sort();
const classes = [];
const vars = [];
for (const n of names) {
  if (n.startsWith('GL_') || /^[A-Z0-9_]+$/.test(n)) vars.push(n);
  else if (/^[A-Z]/.test(n)) classes.push(n);
  else vars.push(n);
}

const lines = [];
lines.push('// Auto-generated shim declarations for D2TS scaffold.');
lines.push('// Regenerate with: npm run refresh:shims');
lines.push('export {};');
lines.push('');
lines.push('declare global {');
for (const n of classes) {
  lines.push(`  class ${n} {`);
  lines.push('    [key: string]: any;');
  lines.push('    constructor(...args: any[]);');
  lines.push('  }');
}
for (const n of vars) lines.push(`  var ${n}: any;`);
lines.push('}');
lines.push('');

writeFileSync(resolve(root, 'src/compat-shims.d.ts'), lines.join('\n'));
console.log(`refresh-shims: wrote ${classes.length} class shims + ${vars.length} value shims`);
