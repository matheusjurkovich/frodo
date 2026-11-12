import type {MemoryInfo} from './memory.types.js';
import {MemoryAlert} from './memory-alert-service.js';
import type {SystemStateEvents} from './system-state-service.types.js';
import {Emitter} from '../../shared/emitter.js';
import {notifications} from '../../../tests/shell/main.js';

class FakeState extends Emitter<SystemStateEvents> {
    memory: MemoryInfo | null = null;

    read(memory: MemoryInfo | null): void {
        this.memory = memory;
        this.emit('memory');
    }
}

describe('MemoryAlert', () => {
    const totalKb = 16 * 1048576;
    let state: FakeState;
    let alert: MemoryAlert | null = null;

    function used(percent: number): MemoryInfo {
        return {totalKb, usedKb: (totalKb * percent) / 100};
    }

    beforeEach(() => {
        notifications.length = 0;
        state = new FakeState();
        alert = new MemoryAlert(state);
    });

    afterEach(() => {
        alert?.destroy();
        alert = null;
    });

    it('avisa uma vez só quando a RAM passa do limite', () => {
        state.read(used(85));
        expect(notifications).toEqual([]);
        state.read(used(92));
        state.read(used(95));
        expect(notifications).toEqual([['Memória alta', '92% da RAM em uso (14.7G de 16.0G)']]);
    });

    it('rearma só depois de cair abaixo do limite de rearme', () => {
        state.read(used(92));
        state.read(used(85));
        state.read(used(92));
        expect(notifications.length).toBe(1);
        state.read(used(70));
        state.read(used(91));
        expect(notifications.length).toBe(2);
    });

    it('leitura que falha não muda o estado', () => {
        state.read(used(92));
        state.read(null);
        state.read(used(92));
        expect(notifications.length).toBe(1);
    });

    it('para de ouvir depois de destruído', () => {
        alert?.destroy();
        state.read(used(99));
        expect(notifications).toEqual([]);
    });
});
