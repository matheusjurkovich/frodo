import type {MemoryInfo} from './memory.types.js';
import {MemoryAlert} from './memory-alert-service.js';
import {CHECK_SECONDS} from './memory-alert-service.const.js';
import {Timer} from '../../shared/timer.js';
import {settle} from '../../../tests/fixtures.js';
import {notifications} from '../../../tests/shell/main.js';

describe('MemoryAlert', () => {
    const totalKb = 16 * 1048576;
    let readings: (MemoryInfo | null)[] = [];
    let alert: MemoryAlert | null = null;
    let every: jasmine.Spy<Timer['every']>;

    function used(percent: number): MemoryInfo {
        return {totalKb, usedKb: (totalKb * percent) / 100};
    }

    async function check(reading: MemoryInfo | null): Promise<void> {
        readings.push(reading);
        const tick = every.calls.mostRecent().args[1];
        tick();
        await settle();
    }

    beforeEach(() => {
        notifications.length = 0;
        readings = [];
        every = spyOn(Timer.prototype, 'every').and.callThrough();
        alert = new MemoryAlert(() => Promise.resolve(readings.shift() ?? null));
    });

    afterEach(() => {
        alert?.destroy();
        alert = null;
    });

    it('confere a memória no intervalo configurado', () => {
        expect(every).toHaveBeenCalledOnceWith(CHECK_SECONDS, jasmine.any(Function));
    });

    it('avisa uma vez só quando a RAM passa do limite', async () => {
        await check(used(85));
        expect(notifications).toEqual([]);
        await check(used(92));
        await check(used(95));
        expect(notifications).toEqual([['Memória alta', '92% da RAM em uso (14.7G de 16.0G)']]);
    });

    it('rearma só depois de cair abaixo do limite de rearme', async () => {
        await check(used(92));
        await check(used(85));
        await check(used(92));
        expect(notifications.length).toBe(1);
        await check(used(70));
        await check(used(91));
        expect(notifications.length).toBe(2);
    });

    it('leitura que falha não muda o estado', async () => {
        await check(used(92));
        await check(null);
        await check(used(92));
        expect(notifications.length).toBe(1);
    });

    it('descarta a leitura que chega depois de destruído', async () => {
        let resolve: (memory: MemoryInfo) => void = () => undefined;
        alert?.destroy();
        alert = new MemoryAlert(() => new Promise(done => (resolve = done)));
        every.calls.mostRecent().args[1]();
        alert.destroy();
        resolve(used(99));
        await settle();
        expect(notifications).toEqual([]);
    });
});
