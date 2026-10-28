import {batteryLevel} from './battery.js';

describe('batteryLevel', () => {
    it('escolhe o nível de bateria para o ícone', () => {
        expect(batteryLevel({percent: 95, charging: false})).toBe('full');
        expect(batteryLevel({percent: 72, charging: false})).toBe('high');
        expect(batteryLevel({percent: 40, charging: false})).toBe('medium');
        expect(batteryLevel({percent: 15, charging: false})).toBe('low');
        expect(batteryLevel({percent: 4, charging: false})).toBe('empty');
        expect(batteryLevel({percent: 50, charging: true})).toBe('charging');
    });
});
