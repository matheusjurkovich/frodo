import type {GitHubFilter} from './github-page.types.js';

export const FILTERS: readonly {id: GitHubFilter; label: string}[] = [
    {id: 'all', label: 'Todos'},
    {id: 'conflict', label: 'Conflito'},
    {id: 'changes', label: 'Alterações'},
    {id: 'ci', label: 'CI'},
    {id: 'review', label: 'Para revisar'},
];

export const STATUS_TEXTS = {
    'signed-out': 'Conecte o GitHub para ver seus PRs',
    disabled: 'Conecte o GitHub para ver seus PRs',
    'bad-token': 'O token foi recusado pelo GitHub',
    'no-repos': 'Nenhum repositório escolhido',
    loading: 'Buscando pull requests…',
    offline: 'Sem conexão com o GitHub. Tento de novo no próximo ciclo.',
    error: 'O GitHub recusou a consulta.',
    ok: '',
} as const;

export const TICK_SECONDS = 60;
