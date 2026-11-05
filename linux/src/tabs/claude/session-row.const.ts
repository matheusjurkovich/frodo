import type {SessionStatus} from '../../features/claude/claude-sessions.types.js';

export const STATUS_LABELS: Record<SessionStatus, string> = {
    working: 'Trabalhando',
    waiting: 'Aguardando você',
    done: 'Concluída',
    idle: 'Ociosa',
};

export const FILL_TASKS = 'frodo-fill-light';
export const FILL_CONTEXT = 'frodo-fill-claude';
export const GRID_SPACING = 12;
