import GLib from 'gi://GLib';

import {Timer} from './timer.js';

describe('Timer', () => {
    it('dispara uma vez depois do atraso', done => {
        const timer = new Timer();
        timer.once(10, () => {
            expect(timer.active).toBeFalse();
            done();
        });
        expect(timer.active).toBeTrue();
    });

    it('cancela antes de disparar', done => {
        const timer = new Timer();
        const fn = jasmine.createSpy('fn');
        timer.once(10, fn);
        timer.stop();
        setTimeout(() => {
            expect(fn).not.toHaveBeenCalled();
            done();
        }, 40);
    });

    it('every segue ativo e coerente quando o callback lança', () => {
        const timer = new Timer();
        let tick: GLib.SourceFunc = () => true;
        const add = spyOn(GLib, 'timeout_add_seconds').and.callFake((_priority, _seconds, fn) => {
            tick = fn;
            return 99;
        });
        const remove = spyOn(GLib, 'source_remove').and.returnValue(true);
        spyOn(globalThis, 'logError');
        timer.every(1, () => {
            throw new Error('falha');
        });
        expect(add).toHaveBeenCalled();
        expect(tick(null)).toBe(GLib.SOURCE_CONTINUE);
        expect(timer.active).toBeTrue();
        timer.destroy();
        expect(remove).toHaveBeenCalledWith(99);
        expect(timer.active).toBeFalse();
    });

    it('destroy cancela o disparo pendente', done => {
        const timer = new Timer();
        const fn = jasmine.createSpy('fn');
        timer.once(10, fn);
        timer.destroy();
        setTimeout(() => {
            expect(fn).not.toHaveBeenCalled();
            done();
        }, 40);
    });
});
