import type {FaultInputs, FaultKind} from './fault.types.js';

export function pickFault({githubStatus, claudeEnabled, hookMissing, wifiFailed, calendarAttention}: FaultInputs): FaultKind | null {
    if (githubStatus === 'bad-token') return 'github';
    if (wifiFailed) return 'wifi';
    if (claudeEnabled && hookMissing) return 'hook';
    if (calendarAttention) return 'agenda';
    return null;
}
