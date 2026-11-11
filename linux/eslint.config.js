import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const pure = {
    regex: '^(gi|resource)://',
    allowTypeImports: true,
    message: 'Regra pura não fala com o GNOME; isso vai para um *-service.ts.',
};
const above = (...layers) => ({regex: `(^|/)(${layers.join('|')})/`, message: `Esta camada não importa ${layers.join(', ')}.`});
const sibling = (layer, message) => ({regex: `^\\.\\./[^.]|(^|/)${layer}/`, message});
const restrict = (files, patterns, ignores = []) => ({
    files,
    ignores,
    rules: {'@typescript-eslint/no-restricted-imports': ['error', {patterns}]},
});
const noUi = {regex: '(^|/)shared/ui/', message: 'Feature não importa componente St.'};
const otherFeature = sibling('features', 'Feature não importa outra feature; o que é comum vai para shared/.');
const topLevel = selector => `:matches(Program, Program > ExportNamedDeclaration) > ${selector}`;
const constant = topLevel("VariableDeclaration[kind='const'] > VariableDeclarator > Identifier.id[name=/^[A-Z][A-Z0-9_]*$/]");
const typeDeclaration = topLevel(':matches(TSInterfaceDeclaration, TSTypeAliasDeclaration, TSEnumDeclaration)');
const behavior = topLevel(':matches(FunctionDeclaration, ClassDeclaration)');
const variable = topLevel('VariableDeclaration');
const syntax = (files, ignores, ...rules) => ({
    files,
    ignores,
    rules: {'no-restricted-syntax': ['error', ...rules.map(([selector, message]) => ({selector, message}))]},
});

const noComments = {
    plugins: {
        frodo: {
            rules: {
                'no-comments': {
                    meta: {type: 'suggestion', schema: [], messages: {comment: 'Sem comentário no código; explique no PR ou no chat.'}},
                    create: context => ({
                        Program() {
                            for (const comment of context.sourceCode.getAllComments()) {
                                if (/^\s*(eslint-|@ts-)/.test(comment.value) || comment.value.startsWith('/')) continue;
                                context.report({loc: comment.loc, messageId: 'comment'});
                            }
                        },
                    }),
                },
            },
        },
    },
    rules: {'frodo/no-comments': 'error'},
};

export default tseslint.config(
    {ignores: ['dist/', '.build/', 'node_modules/', '.superpowers/']},
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/explicit-function-return-type': ['error', {allowExpressions: true}],
            '@typescript-eslint/explicit-member-accessibility': ['error', {accessibility: 'no-public'}],
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/restrict-template-expressions': ['error', {allowNumber: true}],
            eqeqeq: 'error',
            'no-console': 'error',
        },
    },
    {
        files: ['**/*.js'],
        extends: [tseslint.configs.disableTypeChecked],
        rules: {'@typescript-eslint/explicit-function-return-type': 'off'},
    },
    {
        files: ['tools/**/*.js'],
        languageOptions: {globals: {global: 'readonly', ARGV: 'readonly'}},
    },
    restrict(['src/shared/**/*.ts'], [above('settings', 'features', 'pill', 'tabs', 'app')]),
    restrict(['src/settings/**/*.ts'], [above('features', 'pill', 'tabs', 'app'), pure], ['src/settings/**/*.spec.ts']),
    restrict(
        ['src/features/**/*.ts'],
        [above('pill', 'tabs', 'app'), noUi, otherFeature, pure],
        ['src/features/**/*-service.ts', 'src/features/**/*-client.ts', 'src/features/**/*.spec.ts'],
    ),
    restrict(['src/features/**/*-service.ts', 'src/features/**/*-client.ts'], [above('pill', 'tabs', 'app'), noUi, otherFeature]),
    restrict(['src/pill/**/*.ts'], [above('tabs', 'app')]),
    restrict(['src/tabs/**/*.ts'], [above('pill', 'app'), sibling('tabs', 'Aba não importa outra aba.')]),
    syntax(
        ['src/**/*.ts'],
        ['src/**/*.const.ts', 'src/**/*.types.ts', 'src/**/*.spec.ts', 'src/**/*.d.ts'],
        [constant, 'Constante do módulo vai para <módulo>.const.ts.'],
        [typeDeclaration, 'Tipo do módulo vai para <módulo>.types.ts.'],
    ),
    syntax(
        ['src/**/*.const.ts'],
        [],
        [typeDeclaration, 'Tipo vai para <módulo>.types.ts.'],
        [behavior, '<módulo>.const.ts só guarda constantes.'],
    ),
    syntax(['src/**/*.types.ts'], [], [variable, '<módulo>.types.ts só guarda tipos.'], [behavior, '<módulo>.types.ts só guarda tipos.']),
    {files: ['**/*.ts'], ...noComments},
    prettier,
);
