import type {CheckState, PrKind} from '../../features/github/github.types.js';
import type {FrodoIconName} from '../../shared/ui/icons.types.js';

export const KIND_ICONS: Record<PrKind, FrodoIconName> = {
    conflict: 'pr-conflict',
    changes: 'pr-changes',
    ci: 'pr-ci',
    review: 'pr-review',
    ready: 'pr-ready',
};

export const CHECK_LABELS: Record<CheckState, string> = {
    ok: 'passou',
    fail: 'falhou',
    pending: 'rodando',
};
