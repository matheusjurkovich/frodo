import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {ignores: ['dist/', '.build/', 'node_modules/', '.superpowers/', 'docs/']},
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
    },
    prettier,
);
