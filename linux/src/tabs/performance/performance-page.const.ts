import type {ProcessSample} from '../../features/system/performance-service.types.js';
import type {SortKey} from './performance-page.types.js';

export const SORTS: readonly {id: SortKey; label: string}[] = [
    {id: 'cpu', label: 'CPU'},
    {id: 'ram', label: 'RAM'},
    {id: 'gpu', label: 'GPU'},
];

export const TOP = 5;
export const SPARK_HEIGHT = 40;
export const RECENT_BARS = 3;
export const DIM_OPACITY = 115;
export const HIGH_USAGE = 0.85;
export const SPACING = 10;
export const MONITOR_APPS = ['org.gnome.SystemMonitor.desktop', 'net.nokyan.Resources.desktop', 'io.missioncenter.MissionCenter.desktop'];
export const HISTORY_SLOTS = 30;
export const IDLE_FOOTER = 'Atualiza a cada 2 s enquanto esta aba está aberta.';

export const SORT_VALUE: Record<SortKey, (process: ProcessSample) => number> = {
    cpu: process => process.cpu,
    ram: process => process.ramBytes,
    gpu: process => process.gpu ?? 0,
};
