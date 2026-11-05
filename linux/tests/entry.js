import {existsSync, globSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import {build} from 'esbuild';

const SHELL_NAMESPACES = /^gi:\/\/(Shell|Meta|Clutter|St|UPowerGlib|Gvc)(\?.*)?$/;
const SHELL_MODULE = /^resource:\/\/\/org\/gnome\/shell\/(?:.+\/)?([^/]+)\.js$/;

const specs = globSync('{src,tests}/**/*.spec.ts').sort();
const files = ['tests/polyfills.ts', 'tests/setup.ts', ...specs, 'tests/run.ts'];
mkdirSync('.build', {recursive: true});
writeFileSync('.build/entry.ts', files.map(file => `import '../${file}';\n`).join(''));

function stub(name, importPath, importer) {
    const path = resolve('tests/shell', `${name}.ts`);
    if (existsSync(path)) return {path};
    return {errors: [{text: `${importPath} (importado por ${importer}) não tem stub: crie tests/shell/${name}.ts`}]};
}

const shellStubs = {
    name: 'shell-stubs',
    setup(build) {
        build.onResolve({filter: /^resource:\/\/\//}, args => {
            const name = SHELL_MODULE.exec(args.path)?.[1];
            if (!name) return {errors: [{text: `${args.path} não é módulo do shell e não tem stub`}]};
            return stub(name, args.path, args.importer);
        });
        build.onResolve({filter: SHELL_NAMESPACES}, args => stub(SHELL_NAMESPACES.exec(args.path)[1], args.path, args.importer));
    },
};

await build({
    entryPoints: ['.build/entry.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    alias: {'jasmine-boot': './node_modules/jasmine-core/lib/jasmine-core/jasmine.js'},
    external: ['gi://*', 'system'],
    outfile: '.build/tests.js',
    logLevel: 'warning',
    logOverride: {'import-is-undefined': 'silent'},
    plugins: [shellStubs],
}).catch(() => process.exit(1));
