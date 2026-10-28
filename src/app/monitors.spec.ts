import {targetMonitors} from './monitors.js';

describe('monitores', () => {
    it('usa só o principal', () => {
        expect(targetMonitors('primary', 1, 3)).toEqual([1]);
    });

    it('usa o primeiro secundário e cai para o principal sem segundo monitor', () => {
        expect(targetMonitors('secondary', 0, 2)).toEqual([1]);
        expect(targetMonitors('secondary', 1, 3)).toEqual([0]);
        expect(targetMonitors('secondary', 0, 1)).toEqual([0]);
    });

    it('usa todos com o principal primeiro', () => {
        expect(targetMonitors('both', 1, 3)).toEqual([1, 0, 2]);
        expect(targetMonitors('both', 0, 0)).toEqual([]);
    });
});
