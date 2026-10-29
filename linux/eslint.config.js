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
const otherFeature = sibling('features', 'Feature não importa outra feature; o que é comum vai para shared/.');

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
        [above('pill', 'tabs', 'app'), otherFeature, pure],
        ['src/features/**/*-service.ts', 'src/features/**/*-client.ts', 'src/features/**/*.spec.ts'],
    ),
    restrict(['src/features/**/*-service.ts', 'src/features/**/*-client.ts'], [above('pill', 'tabs', 'app'), otherFeature]),
    restrict(['src/pill/**/*.ts'], [above('tabs', 'app')]),
    restrict(['src/tabs/**/*.ts'], [above('pill', 'app'), sibling('tabs', 'Aba não importa outra aba.')]),
    prettier,
);
