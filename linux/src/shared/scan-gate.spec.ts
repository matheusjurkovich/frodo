import {ScanGate} from './scan-gate.js';
import {Timer} from './timer.js';

describe('ScanGate', () => {
    let tick: () => void;
    let release: () => void;
    let task: jasmine.Spy<() => Promise<void>>;
    let changes: jasmine.Spy;
    let every: jasmine.Spy;
    let stop: jasmine.Spy;

    function create(announceStart = false): ScanGate {
        return new ScanGate({task, onChange: changes, announceStart});
    }

    beforeEach(() => {
        tick = () => undefined;
        release = () => undefined;
        task = jasmine.createSpy('task').and.callFake(
            () =>
                new Promise<void>(resolve => {
                    release = resolve;
                }),
        );
        changes = jasmine.createSpy('onChange');
        every = spyOn(Timer.prototype, 'every').and.callFake((_seconds, callback) => {
            tick = callback;
        });
        stop = spyOn(Timer.prototype, 'stop');
    });

    it('chamadas concorrentes dividem a mesma execução e avisam ao terminar', async () => {
        const gate = create();
        const first = gate.run();
        expect(gate.run()).toBe(first);
        expect(gate.running).toBeTrue();
        expect(task).toHaveBeenCalledTimes(1);
        expect(changes).not.toHaveBeenCalled();
        release();
        await first;
        expect(gate.running).toBeFalse();
        expect(changes).toHaveBeenCalledTimes(1);
    });

    it('com announceStart avisa também ao começar', async () => {
        const gate = create(true);
        const done = gate.run();
        expect(changes).toHaveBeenCalledTimes(1);
        release();
        await done;
        expect(changes).toHaveBeenCalledTimes(2);
    });

    it('só liga o timer no primeiro interessado e desliga no último', () => {
        const gate = create();
        gate.setWanted(true, 30);
        gate.setWanted(true, 30);
        expect(every).toHaveBeenCalledTimes(1);
        expect(task).toHaveBeenCalledTimes(1);
        gate.setWanted(false, 30);
        expect(stop).not.toHaveBeenCalled();
        gate.setWanted(false, 30);
        expect(stop).toHaveBeenCalledTimes(1);
        gate.setWanted(false, 30);
        gate.setWanted(true, 30);
        expect(every).toHaveBeenCalledTimes(2);
    });

    it('o timer dispara a tarefa', () => {
        const gate = create();
        gate.poll(60);
        expect(task).not.toHaveBeenCalled();
        tick();
        expect(task).toHaveBeenCalledTimes(1);
        expect(gate.lastRun).toBeGreaterThan(0);
    });

    it('poll nulo só para o timer', () => {
        const gate = create();
        gate.poll(null);
        expect(every).not.toHaveBeenCalled();
        expect(stop).toHaveBeenCalled();
    });

    it('depois de destruído ignora setWanted e não avisa', async () => {
        const gate = create();
        const done = gate.run();
        gate.destroy();
        gate.setWanted(true, 30);
        expect(every).not.toHaveBeenCalled();
        release();
        await done;
        expect(changes).not.toHaveBeenCalled();
    });
});
