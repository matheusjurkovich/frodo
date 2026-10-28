import {AI_PROVIDERS, CLOSED_ITEMS} from '../../settings/schema-values.js';
import type {AiProvider, ClosedItem} from '../../settings/schema-values.js';

export const ITEM_LABELS: Record<ClosedItem, string> = {
    clock: 'Relógio',
    date: 'Data',
    notifications: 'Notificações',
    network: 'Rede',
    bluetooth: 'Bluetooth',
    volume: 'Som',
    microphone: 'Microfone',
    'do-not-disturb': 'Não perturbe',
    system: 'Outros ícones do sistema',
    battery: 'Bateria',
    ram: 'RAM',
    'claude-session': 'Claude · sessão',
    'claude-weekly': 'Claude · semana',
    'codex-session': 'Codex · 5 h',
    'codex-weekly': 'Codex · semana',
    'gemini-daily': 'Gemini · hoje',
    extensions: 'Ícones de extensões',
};

export function moveItem(items: readonly ClosedItem[], item: ClosedItem, delta: -1 | 1): ClosedItem[] {
    const next = items.filter(other => other !== item);
    const from = items.indexOf(item);
    if (from < 0) return [...items];
    next.splice(Math.min(next.length, Math.max(0, from + delta)), 0, item);
    return next;
}

export function missingItems(items: readonly ClosedItem[], providers: readonly AiProvider[] = AI_PROVIDERS): ClosedItem[] {
    const off = AI_PROVIDERS.filter(provider => !providers.includes(provider));
    return CLOSED_ITEMS.filter(item => !items.includes(item) && !off.some(provider => item.startsWith(`${provider}-`)));
}
