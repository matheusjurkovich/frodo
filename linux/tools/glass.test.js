import {readFileSync} from 'node:fs';
import process, {stderr, stdout, argv} from 'node:process';
import {fileURLToPath} from 'node:url';

const GLASS = '.frodo-surface-glass ';
const OPAQUE = /background-color:\s*(#17171a|#1f1f23|#232327|#26262b|#2a2a2f)/;
const FLOATING = ['.frodo-power-menu', '.frodo-tongue:hover'];

const css = readFileSync(argv[2] ?? fileURLToPath(import.meta.resolve('../stylesheet.css')), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors.split(',').map(selector => selector.trim()),
    body,
}));
const glass = new Set(
    rules
        .flatMap(rule => rule.selectors)
        .filter(selector => selector.startsWith(GLASS))
        .map(selector => selector.slice(GLASS.length)),
);
const painted = rules
    .filter(rule => /background-color:/.test(rule.body))
    .flatMap(rule => rule.selectors.map(selector => ({selector, body: rule.body})));

const missing = new Set();
for (const {selector, body} of painted) {
    if (selector.includes('frodo-surface') || glass.has(selector) || FLOATING.includes(selector)) continue;
    const opaque = OPAQUE.test(body);
    const variant = [...glass].some(base => selector.startsWith(base) && /^[:.][^ ]*$/.test(selector.slice(base.length)));
    if (opaque || variant) missing.add(selector);
}

if (missing.size > 0) {
    stderr.write(`Fundo sem versão de vidro (${GLASS.trim()}):\n${[...missing].join('\n')}\n`);
    process.exitCode = 1;
} else {
    stdout.write('glass: ok\n');
}
