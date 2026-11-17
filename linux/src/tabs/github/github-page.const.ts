import type {GitHubAlertKind} from '../../settings/schema-values.types.js';
import type {GitHubFilter} from './github-page.types.js';

export const FILTERS: readonly {id: GitHubFilter; label: string}[] = [
    {id: 'all', label: 'Todos'},
    {id: 'conflict', label: 'Conflito'},
    {id: 'changes', label: 'Alterações pedidas'},
    {id: 'ci', label: 'CI falhando'},
    {id: 'review', label: 'Para revisar'},
];

export const TILES: readonly {id: GitHubAlertKind; label: string}[] = [
    {id: 'conflict', label: 'Com conflito'},
    {id: 'changes', label: 'Alterações pedidas'},
    {id: 'ci', label: 'CI falhando'},
    {id: 'review', label: 'Para você revisar'},
];

export const STATUS_TEXTS = {
    'signed-out': 'Conecte o GitHub para ver seus PRs',
    disabled: 'Conecte o GitHub para ver seus PRs',
    'bad-token': 'O token foi recusado pelo GitHub',
    'no-repos': 'Nenhum repositório escolhido',
    loading: 'Buscando pull requests…',
} as const;

export const TICK_SECONDS = 60;
