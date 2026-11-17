import type {CheckState} from '../../features/github/github.types.js';

export const CHECK_LABELS: Record<CheckState, string> = {
    ok: 'passou',
    fail: 'falhou',
    pending: 'rodando',
};
