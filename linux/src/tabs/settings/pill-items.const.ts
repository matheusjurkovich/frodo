import type {ClosedItem} from '../../settings/schema-values.types.js';

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
