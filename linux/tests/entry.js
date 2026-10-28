import {globSync, mkdirSync, writeFileSync} from 'node:fs';

const specs = globSync('{src,tests}/**/*.spec.ts').sort();
const files = ['tests/polyfills.ts', 'tests/setup.ts', ...specs, 'tests/run.ts'];
mkdirSync('.build', {recursive: true});
writeFileSync('.build/entry.ts', files.map(file => `import '../${file}';\n`).join(''));
