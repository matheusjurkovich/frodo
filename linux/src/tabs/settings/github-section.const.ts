import type {GitHubAlertKind, GitHubAuthMode, GitHubScope} from '../../settings/schema-values.types.js';
import type {NumberOption} from './settings-rows.types.js';

export const AUTH_OPTIONS: readonly {id: GitHubAuthMode; label: string}[] = [
    {id: 'gh', label: 'GitHub CLI'},
    {id: 'token', label: 'Token'},
];

export const AUTH_HINTS: Record<GitHubAuthMode, string> = {
    gh: 'Usa o login que o gh já tem nesta máquina',
    token: 'Token pessoal com leitura de pull requests, guardado no chaveiro do GNOME',
};

export const SCOPE_OPTIONS: readonly {id: GitHubScope; label: string}[] = [
    {id: 'mine', label: 'Todos os meus'},
    {id: 'list', label: 'Só estes'},
];

export const ALERT_ROWS: readonly {id: GitHubAlertKind; label: string; sub: string}[] = [
    {id: 'conflict', label: 'PR com conflito', sub: 'A base mudou e o merge não sai sozinho'},
    {id: 'changes', label: 'Alterações pedidas', sub: 'Alguém revisou e pediu mudanças'},
    {id: 'ci', label: 'CI falhando', sub: 'Algum check do seu PR falhou'},
    {id: 'review', label: 'Revisão pedida a você', sub: 'Alguém pediu sua revisão num PR'},
];

export const POLL_OPTIONS: readonly NumberOption[] = [
    {id: 2, label: '2 min'},
    {id: 5, label: '5 min'},
    {id: 10, label: '10 min'},
    {id: 15, label: '15 min'},
];
