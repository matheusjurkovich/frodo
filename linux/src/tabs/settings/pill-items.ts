import {CLOSED_ITEMS} from '../../settings/schema-values.js';
import type {ClosedItem} from '../../settings/schema-values.js';

export const ITEM_LABELS: Record<ClosedItem, string> = {
    clock: 'Relógio',
    date: 'Data',
    notifications: 'Notificações',
    network: 'Rede',
    system: 'Ícones do sistema',
    battery: 'Bateria',
    ram: 'RAM',
    'claude-session': 'Claude · sessão',
    'claude-weekly': 'Claude · semana',
    extensions: 'Ícones de extensões',
};

export function moveItem(items: readonly ClosedItem[], item: ClosedItem, delta: -1 | 1): ClosedItem[] {
    const next = items.filter(other => other !== item);
    const from = items.indexOf(item);
    if (from < 0) return [...items];
    next.splice(Math.min(next.length, Math.max(0, from + delta)), 0, item);
    return next;
}

export function missingItems(items: readonly ClosedItem[]): ClosedItem[] {
    return CLOSED_ITEMS.filter(item => !items.includes(item));
}
