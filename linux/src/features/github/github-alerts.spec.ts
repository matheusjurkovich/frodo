import {alertCount, kindsByKey, newAlerts, pruneMuted, visibleAlerts} from './github-alerts.js';
import type {ClassifiedPr, PrKind} from './github.types.js';

function pr(key: string, kind: PrKind): ClassifiedPr {
    return {
        key,
        repo: 'dono/frodo',
        number: 1,
        title: '',
        url: '',
        head: '',
        base: '',
        author: '',
        additions: 0,
        deletions: 0,
        files: 0,
        comments: 0,
        updatedAt: 0,
        mergeable: 'MERGEABLE',
        reviewDecision: null,
        changesBy: null,
        approvedBy: null,
        rollup: null,
        checks: [],
        behindBy: null,
        reviewRequested: false,
        kind,
    };
}

const ALL = ['conflict', 'changes', 'ci', 'review'] as const;

describe('alertas do GitHub', () => {
    it('ciclo de referência não alerta', () => {
        expect(newAlerts(null, [pr('a#1', 'conflict')])).toEqual([]);
    });

    it('alerta PR novo e mudança de tipo, mas não o que já estava', () => {
        const before = kindsByKey([pr('a#1', 'conflict'), pr('a#2', 'ci')]);
        const alerts = newAlerts(before, [pr('a#1', 'conflict'), pr('a#2', 'conflict'), pr('a#3', 'review')]);
        expect(alerts.map(alert => alert.key)).toEqual(['a#2', 'a#3']);
    });

    it('PR que saiu e voltou alerta de novo', () => {
        const before = kindsByKey([]);
        expect(newAlerts(before, [pr('a#1', 'changes')]).map(alert => alert.key)).toEqual(['a#1']);
    });

    it('pronto para merge nunca alerta', () => {
        expect(newAlerts(kindsByKey([]), [pr('a#1', 'ready')])).toEqual([]);
    });

    it('filtra por tipo ligado e PR silenciado', () => {
        const alerts = [pr('a#1', 'conflict'), pr('a#2', 'ci'), pr('a#3', 'review')];
        expect(visibleAlerts(alerts, ['conflict', 'review'], ['a#3']).map(alert => alert.key)).toEqual(['a#1']);
    });

    it('conta os PRs que pedem atenção, sem silenciados nem prontos', () => {
        const prs = [pr('a#1', 'conflict'), pr('a#2', 'review'), pr('a#3', 'ready'), pr('a#4', 'ci')];
        expect(alertCount(prs, ALL, [])).toBe(3);
        expect(alertCount(prs, ALL, ['a#4'])).toBe(2);
        expect(alertCount(prs, ['conflict'], [])).toBe(1);
    });

    it('esquece o silêncio de PR que sumiu', () => {
        expect(pruneMuted(['a#1', 'a#2'], [pr('a#2', 'ci')])).toEqual(['a#2']);
    });
});
