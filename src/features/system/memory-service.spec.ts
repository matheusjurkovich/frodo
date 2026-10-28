import {readMemory} from './memory-service.js';

describe('readMemory', () => {
    it('lê /proc/meminfo', async () => {
        const memory = await readMemory();
        expect(memory).not.toBeNull();
        expect(memory?.usedKb).toBeGreaterThan(0);
        expect(memory?.usedKb).toBeLessThan(memory?.totalKb ?? 0);
    });
});
