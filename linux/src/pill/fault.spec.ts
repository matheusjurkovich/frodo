import {pickFault} from './fault.js';
import type {FaultInputs} from './fault.types.js';

const QUIET: FaultInputs = {githubStatus: 'ok', claudeEnabled: true, hookMissing: false, wifiFailed: false, calendarAttention: false};

describe('pickFault', () => {
    it('sem nada errado não há falha', () => {
        expect(pickFault(QUIET)).toBeNull();
    });

    it('token recusado é falha do GitHub', () => {
        expect(pickFault({...QUIET, githubStatus: 'bad-token'})).toBe('github');
    });

    it('GitHub sem login não é falha', () => {
        for (const githubStatus of ['signed-out', 'disabled', 'offline'] as const) expect(pickFault({...QUIET, githubStatus})).toBeNull();
    });

    it('hook ausente só com Claude ligado', () => {
        expect(pickFault({...QUIET, hookMissing: true, claudeEnabled: false})).toBeNull();
        expect(pickFault({...QUIET, hookMissing: true})).toBe('hook');
    });

    it('vermelha antes de âmbar', () => {
        expect(pickFault({...QUIET, githubStatus: 'bad-token', calendarAttention: true})).toBe('github');
        expect(pickFault({...QUIET, wifiFailed: true, hookMissing: true})).toBe('wifi');
        expect(pickFault({...QUIET, hookMissing: true, calendarAttention: true})).toBe('hook');
    });
});
