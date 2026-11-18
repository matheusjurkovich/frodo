import type {TabId} from '../settings/schema-values.types.js';
import type {FaultKind, FaultTone} from './fault.types.js';

export const FAULT_TEXTS: Record<FaultKind, string> = {
    github: 'GitHub desconectado',
    wifi: 'Wi-Fi não conectou',
    hook: 'Hook do Claude ausente',
    agenda: 'Agenda sem sincronizar',
};

export const FAULT_TONES: Record<FaultKind, FaultTone> = {
    github: 'danger',
    wifi: 'danger',
    hook: 'warn',
    agenda: 'warn',
};

export const FAULT_TABS: Record<FaultKind, TabId> = {
    github: 'github',
    wifi: 'general',
    hook: 'claude',
    agenda: 'calendar',
};
