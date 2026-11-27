import type {FrodoIconName} from '../../shared/ui/icons.types.js';
import type {CheckState} from '../../features/github/github.types.js';

export const CHECK_LABELS: Record<CheckState, string> = {
    ok: 'passou',
    fail: 'falhou',
    pending: 'rodando',
};

export const CHECK_ICONS: Record<CheckState, FrodoIconName> = {
    ok: 'check',
    fail: 'close',
    pending: 'refresh',
};
