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
});
