import {addCell, cellKey, dayStart, hourStart, summarize} from './consumption.js';
import type {ModelGroups, UsageCell} from './consumption.types.js';
import {weekdayLabel} from './format.js';

const groups: ModelGroups = {
    order: ['opus', 'sonnet'],
    family: model => model.split('-')[0] ?? '',
    label: model => model.toUpperCase(),
};

const now = new Date(2026, 9, 28, 14, 30);

function cell(hour: Date, changes: Partial<UsageCell> = {}): UsageCell {
    return {hour: hour.getTime(), model: 'opus-5', project: 'frodo', session: 's1', input: 10, output: 5, cacheRead: 0, ...changes};
}

const today = (hour: number): Date => new Date(2026, 9, 28, hour);
const daysAgo = (days: number, hour = 12): Date => new Date(2026, 9, 28 - days, hour);

describe('consumption', () => {
    it('hourStart corta minutos, segundos e milissegundos', () => {
        expect(hourStart(new Date(2026, 9, 28, 14, 37, 12, 345).getTime())).toBe(today(14).getTime());
        expect(hourStart(today(14).getTime())).toBe(today(14).getTime());
    });

    it('dayStart volta dias atravessando o mês e avança com valor negativo', () => {
        const ms = new Date(2026, 10, 2, 15, 45).getTime();
        expect(dayStart(ms)).toBe(new Date(2026, 10, 2).getTime());
        expect(dayStart(ms, 3)).toBe(new Date(2026, 9, 30).getTime());
        expect(dayStart(ms, -1)).toBe(new Date(2026, 10, 3).getTime());
    });

    it('addCell soma células da mesma chave sem alterar a original', () => {
        const cells = new Map<string, UsageCell>();
        const first = cell(today(10), {cacheRead: 3});
        addCell(cells, first);
        addCell(cells, first);
        addCell(cells, cell(today(10), {session: 's2'}));
        expect(cells.size).toBe(2);
        expect(cells.get(cellKey(first))).toEqual({...first, input: 20, output: 10, cacheRead: 6});
        expect(first.input).toBe(10);
    });

    it('cellKey distingue hora, modelo, projeto e sessão', () => {
        const base = cell(today(10));
        const keys = new Set([
            cellKey(base),
            cellKey({...base, hour: today(11).getTime()}),
            cellKey({...base, model: 'sonnet-5'}),
            cellKey({...base, project: 'outro'}),
            cellKey({...base, session: 's2'}),
            cellKey({...base, input: 99}),
        ]);
        expect(keys.size).toBe(5);
    });

    it('hoje soma só as células do dia e conta sessões distintas', () => {
        const summary = summarize(
            [
                cell(today(9), {input: 100, output: 20, cacheRead: 7}),
                cell(today(23), {input: 1, output: 2, session: 's2'}),
                cell(daysAgo(1, 23), {input: 1000}),
                cell(daysAgo(-1, 0), {input: 1000}),
            ],
            'today',
            now,
            groups,
        );
        expect([summary.input, summary.output, summary.cacheRead, summary.total, summary.sessions]).toEqual([101, 22, 7, 123, 2]);
    });

    it('hoje desenha das 8h às 18h, marca a hora atual e as futuras', () => {
        const {bars} = summarize([cell(today(10)), cell(today(10), {session: 's2'})], 'today', now, groups);
        expect(bars.map(bar => bar.label)).toEqual(['08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h']);
        expect(bars[2]?.value).toBe(30);
        expect(bars.filter(bar => bar.current).map(bar => bar.label)).toEqual(['14h']);
        expect(bars.filter(bar => bar.future).map(bar => bar.label)).toEqual(['15h', '16h', '17h', '18h']);
    });

    it('hoje estende até a hora mais cedo com uso e até a hora atual, rotulando de duas em duas', () => {
        const late = new Date(2026, 9, 28, 21, 5);
        const {bars} = summarize([cell(today(5)), cell(today(3), {input: 0, output: 0, cacheRead: 50})], 'today', late, groups);
        expect(bars.length).toBe(17);
        expect(bars[0]).toEqual({label: '05h', value: 15, current: false, future: false});
        expect(bars[1]?.label).toBe('');
        expect(bars[2]?.label).toBe('07h');
        expect(bars[16]).toEqual({label: '21h', value: 0, current: true, future: false});
    });

    it('7 dias tem uma barra por dia com o nome do dia e corta o oitavo dia', () => {
        const summary = summarize([cell(daysAgo(6)), cell(daysAgo(7), {input: 999}), cell(today(1)), cell(today(20))], '7d', now, groups);
        expect(summary.total).toBe(45);
        expect(summary.bars.map(bar => bar.label)).toEqual(Array.from({length: 7}, (_, i) => weekdayLabel(daysAgo(6 - i).getDay())));
        expect(summary.bars.map(bar => bar.value)).toEqual([15, 0, 0, 0, 0, 0, 30]);
        expect(summary.bars.map(bar => bar.current)).toEqual([false, false, false, false, false, false, true]);
        expect(summary.bars.some(bar => bar.future)).toBeFalse();
    });

    it('30 dias rotula a data a cada sete barras', () => {
        const summary = summarize([cell(daysAgo(29)), cell(daysAgo(30))], '30d', now, groups);
        expect(summary.total).toBe(15);
        expect(summary.bars.length).toBe(30);
        expect(summary.bars[0]?.value).toBe(15);
        expect(summary.bars.map(bar => bar.label).filter(Boolean)).toEqual(['29/9', '6/10', '13/10', '20/10', '27/10']);
        expect(summary.bars[7]?.label).toBe('6/10');
        expect(summary.bars[29]?.current).toBeTrue();
    });

    it('modelos seguem a ordem das famílias, usam o rótulo do modelo mais recente e somem sem tokens', () => {
        const summary = summarize(
            [
                cell(today(12), {model: 'sonnet-4', input: 50, output: 0}),
                cell(today(10), {model: 'opus-4', input: 10, output: 0}),
                cell(today(12), {model: 'opus-5', input: 20, output: 0}),
                cell(today(11), {model: 'opus-4', input: 10, output: 0}),
                cell(today(13), {model: 'haiku-4', input: 10, output: 0}),
            ],
            'today',
            now,
            groups,
        );
        expect(summary.models).toEqual([
            {name: 'opus', label: 'OPUS-5', tokens: 40, fraction: 0.4},
            {name: 'sonnet', label: 'SONNET-4', tokens: 50, fraction: 0.5},
        ]);
        const cacheOnly = summarize([cell(today(10), {model: 'sonnet-4', input: 0, output: 0, cacheRead: 9})], 'today', now, groups);
        expect(cacheOnly.models).toEqual([]);
    });

    it('projetos ficam nos quatro maiores, com empate em ordem alfabética', () => {
        const summary = summarize(
            [
                cell(today(10), {project: 'e', input: 1, output: 0}),
                cell(today(10), {project: 'd', input: 2, output: 0}),
                cell(today(10), {project: 'c', input: 2, output: 0}),
                cell(today(10), {project: 'b', input: 5, output: 0}),
                cell(today(10), {project: 'a', input: 3, output: 0}),
                cell(today(10), {project: 'z', input: 0, output: 0, cacheRead: 100}),
            ],
            'today',
            now,
            groups,
        );
        expect(summary.projects.map(project => [project.name, project.tokens])).toEqual([
            ['b', 5],
            ['a', 3],
            ['c', 2],
            ['d', 2],
        ]);
        expect(summary.projects[0]?.fraction).toBeCloseTo(5 / 13);
    });

    it('sem células devolve tudo zerado', () => {
        const summary = summarize([], '7d', now, groups);
        expect([summary.input, summary.output, summary.cacheRead, summary.total, summary.sessions]).toEqual([0, 0, 0, 0, 0]);
        expect(summary.models).toEqual([]);
        expect(summary.projects).toEqual([]);
        expect(summary.bars.every(bar => bar.value === 0)).toBeTrue();
    });
});
