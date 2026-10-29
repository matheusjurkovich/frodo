import {StepGate} from './step-gate.js';

describe('StepGate', () => {
    let gate: StepGate;

    beforeEach(() => {
        gate = new StepGate();
    });

    it('primeiro passo de uma sessão é admitido', () => {
        expect(gate.admits('a', 'Edit x.ts', 0)).toBeTrue();
    });

    it('o mesmo passo repete a decisão', () => {
        gate.admits('a', 'Edit x.ts', 0);
        gate.shown('a', 0);
        expect(gate.admits('a', 'Edit x.ts', 1000)).toBeTrue();
    });

    it('passo novo dentro de 10 s do último mostrado é recusado e não volta depois', () => {
        gate.admits('a', 'Edit x.ts', 0);
        gate.shown('a', 0);
        expect(gate.admits('a', 'Edit y.ts', 4000)).toBeFalse();
        expect(gate.admits('a', 'Edit y.ts', 20000)).toBeFalse();
    });

    it('passo novo depois de 10 s é admitido', () => {
        gate.admits('a', 'Edit x.ts', 0);
        gate.shown('a', 0);
        expect(gate.admits('a', 'Edit z.ts', 10000)).toBeTrue();
    });

    it('a janela conta de quando apareceu, não do evento', () => {
        gate.admits('a', 'Edit x.ts', 0);
        gate.shown('a', 8000);
        expect(gate.admits('a', 'Edit y.ts', 12000)).toBeFalse();
    });

    it('sessões têm janelas independentes', () => {
        gate.admits('a', 'Edit x.ts', 0);
        gate.shown('a', 0);
        expect(gate.admits('b', 'Edit y.ts', 1000)).toBeTrue();
    });

    it('retain esquece sessões encerradas', () => {
        gate.admits('a', 'Edit x.ts', 0);
        gate.shown('a', 0);
        gate.retain(new Set());
        expect(gate.admits('a', 'Edit y.ts', 1000)).toBeTrue();
    });
});
