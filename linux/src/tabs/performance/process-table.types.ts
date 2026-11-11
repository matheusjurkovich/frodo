import type {ProcessSample} from '../../features/system/performance-service.types.js';

export type SortKey = 'cpu' | 'ram' | 'gpu';

export interface ProcessRowActions {
    readonly ask: (process: ProcessSample) => void;
}

export interface ProcessConfirmActions {
    readonly cancel: () => void;
    readonly confirm: () => void;
}
