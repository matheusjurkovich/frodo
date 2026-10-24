import type {MonitorMode} from './types.js';

export function targetMonitors(mode: MonitorMode, primary: number, count: number): number[] {
    if (count === 0) return [];
    const others = Array.from({length: count}, (_, index) => index).filter(index => index !== primary);
    switch (mode) {
        case 'primary':
            return [primary];
        case 'secondary':
            return [others[0] ?? primary];
        case 'both':
            return [primary, ...others];
    }
}
