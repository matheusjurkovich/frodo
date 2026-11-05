import type {SessionStatus} from '../../features/claude/claude-sessions.types.js';
import type {Filter} from './sessions-card.types.js';

export const TICK_SECONDS = 30;

export const FILTERS: readonly {id: Filter; label: string}[] = [
    {id: 'all', label: 'Todas'},
    {id: 'working', label: 'Trabalhando'},
    {id: 'waiting', label: 'Aguardando'},
    {id: 'done', label: 'Concluídas'},
    {id: 'idle', label: 'Ociosas'},
];

export const ORDER: Record<SessionStatus, number> = {waiting: 0, working: 1, done: 2, idle: 3};
