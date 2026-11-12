import type {SystemState} from './system-state-service.js';

export type MemoryAlertSource = Pick<SystemState, 'on' | 'memory'>;
