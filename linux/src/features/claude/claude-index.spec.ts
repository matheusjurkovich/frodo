import {ClaudeIndex} from './claude-index.js';
import {parseAssistantLine} from './claude-transcript.js';
import {line} from '../../../tests/fixtures.js';

const now = new Date(2026, 9, 27, 10, 30);

const at = (day: number, hour: number, month = 9): Date => new Date(2026, month, day, hour, 5);

const first = line({
    id: 'm1',
    at: at(27, 9),
    cwd: '/home/u/dynamic-island',
    session: 's1',
    input: 100,
    output: 50,
    cacheRead: 1000,
    cacheWrite: 10,
});

const lines = [
    first,
    first,
    line({id: 'm2', at: at(27, 10), model: 'claude-sonnet-5-5', cwd: '/home/u/loja-api', session: 's2', input: 200, output: 100}),
    line({id: 'm3', at: at(25, 15), cwd: '/home/u/dynamic-island', session: 's3', input: 300}),
    line({id: 'm4', at: at(10, 12), model: 'claude-haiku-5-5', cwd: '/home/u/portal', session: 's4', input: 1000}),
    line({id: 'm5', at: at(20, 12, 8), cwd: '/home/u/velho', session: 's5', input: 5000}),
    line({id: 'm6', at: at(27, 9), model: '<synthetic>', session: 's1', input: 999}),
];

function feed(index: ClaudeIndex, text: string): void {
    const entry = parseAssistantLine(text);
    if (entry) index.add(entry);
}

function build(): ClaudeIndex {
    const index = new ClaudeIndex();
    for (const text of lines) feed(index, text);
    index.prune(now.getTime());
    return index;
}

describe('ClaudeIndex', () => {
    it('resume hoje por hora', () => {
        const today = build().summary('today', now);
        expect([today.input, today.output, today.cacheRead, today.sessions, today.total]).toEqual([300, 150, 1000, 2, 450]);
        expect(today.bars.map(bar => bar.label)).toEqual(['08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h']);
        expect(today.bars.slice(0, 3).map(bar => bar.value)).toEqual([0, 150, 300]);
        expect(today.bars.findIndex(bar => bar.current)).toBe(2);
        expect(today.bars.filter(bar => bar.future).length).toBe(8);
        expect(today.models.map(share => [share.label, share.tokens])).toEqual([
            ['Opus 5.5', 150],
            ['Sonnet 5.5', 300],
        ]);
        expect(today.projects.map(share => [share.name, share.tokens])).toEqual([
            ['loja-api', 300],
            ['dynamic-island', 150],
        ]);
    });

    it('rotula hora sim, hora não quando o dia passa de 12 horas', () => {
        const late = new Date(2026, 9, 27, 23, 30);
        const index = new ClaudeIndex();
        feed(index, line({id: 'cedo', at: at(27, 6), session: 's9', input: 10}));
        const labels = index.summary('today', late).bars.map(bar => bar.label);
        expect(labels.length).toBe(18);
        expect(labels.filter(Boolean)).toEqual(['06h', '08h', '10h', '12h', '14h', '16h', '18h', '20h', '22h']);
    });

    it('resume 7 dias por dia', () => {
        const week = build().summary('7d', now);
        expect([week.input, week.output, week.sessions, week.total]).toEqual([600, 150, 3, 750]);
        expect(week.bars.map(bar => bar.label)).toEqual(['Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Seg', 'Ter']);
        expect(week.bars.map(bar => bar.value)).toEqual([0, 0, 0, 0, 300, 0, 450]);
        expect(week.bars.findIndex(bar => bar.current)).toBe(6);
    });

    it('resume 30 dias e descarta o que é mais antigo', () => {
        const month = build().summary('30d', now);
        expect([month.input, month.sessions, month.total]).toEqual([1600, 4, 1750]);
        expect(month.bars.length).toBe(30);
        expect(month.bars.map(bar => bar.label).filter(Boolean)).toEqual(['28/9', '5/10', '12/10', '19/10', '26/10']);
        expect(month.projects.map(share => share.name)).toEqual(['portal', 'dynamic-island', 'loja-api']);
        expect(build().session('s5')).toBeNull();
    });

    it('guarda os números da sessão', () => {
        expect(build().session('s1')).toEqual({
            tokens: 150,
            model: 'claude-opus-5-5',
            contextTokens: 1110,
            branch: 'main',
            startedAt: at(27, 9).getTime(),
            lastAt: at(27, 9).getTime(),
            todos: null,
        });
        const index = new ClaudeIndex();
        const entry = parseAssistantLine(line({id: 't', at: at(27, 9), session: 'sx', todos: ['completed', 'in_progress', 'pending']}));
        if (entry) index.add(entry);
        expect(index.session('sx')?.todos).toEqual({done: 1, total: 3});
    });

    it('guarda as tarefas de uma linha repetida sem contar de novo', () => {
        const index = new ClaudeIndex();
        feed(index, line({id: 'd', at: at(27, 9), session: 'sd', input: 10, output: 5}));
        feed(index, line({id: 'd', at: at(27, 9), session: 'sd', input: 10, output: 5, todos: ['completed', 'pending']}));
        expect(index.session('sd')?.tokens).toBe(15);
        expect(index.session('sd')?.todos).toEqual({done: 1, total: 2});
        index.setTodos('sd', at(27, 8).getTime(), {done: 0, total: 9});
        index.setTodos('desconhecida', at(27, 10).getTime(), {done: 1, total: 1});
        expect(index.session('sd')?.todos).toEqual({done: 1, total: 2});
        expect(index.session('desconhecida')).toBeNull();
    });

    it('conta o subagente na sessão sem trocar o modelo nem o contexto dela', () => {
        const index = new ClaudeIndex();
        feed(index, line({id: 'p1', at: at(27, 9), session: 'sc', input: 100, output: 10, cacheRead: 1000, branch: 'main'}));
        feed(
            index,
            line({
                id: 'c1',
                at: at(27, 10),
                model: 'claude-haiku-5-5',
                session: 'sc',
                input: 50,
                output: 5,
                cacheRead: 9,
                branch: 'outra',
                sidechain: true,
                todos: ['completed'],
            }),
        );
        expect(index.session('sc')).toEqual({
            tokens: 165,
            model: 'claude-opus-5-5',
            contextTokens: 1100,
            branch: 'main',
            startedAt: at(27, 9).getTime(),
            lastAt: at(27, 10).getTime(),
            todos: null,
        });
        expect(index.summary('today', now).input).toBe(150);
        feed(
            index,
            line({id: 'p2', at: new Date(2026, 9, 27, 9, 30), model: 'claude-sonnet-5-5', session: 'sc', input: 1, cacheRead: 2000}),
        );
        expect(index.session('sc')?.model).toBe('claude-sonnet-5-5');
        expect(index.session('sc')?.contextTokens).toBe(2001);
        expect(index.session('sc')?.lastAt).toBe(at(27, 10).getTime());
    });

    it('deixa vazios o modelo e o contexto da sessão só com subagente', () => {
        const index = new ClaudeIndex();
        feed(index, line({id: 'c', at: at(27, 9), session: 'so', input: 5, output: 1, sidechain: true}));
        const copy = ClaudeIndex.fromJSON(JSON.parse(JSON.stringify(index.toJSON())));
        expect(copy.session('so')).toEqual({
            tokens: 6,
            model: '',
            contextTokens: 0,
            branch: null,
            startedAt: at(27, 9).getTime(),
            lastAt: at(27, 9).getTime(),
            todos: null,
        });
    });

    it('conta uma vez o mesmo id em sessões diferentes e esquece o id junto com a célula', () => {
        const index = new ClaudeIndex();
        feed(index, line({id: 'h', at: at(27, 9), session: 'original', input: 40}));
        feed(index, line({id: 'h', at: at(27, 9), session: 'retomada', input: 40}));
        expect(index.summary('today', now).input).toBe(40);
        expect(index.session('retomada')).toBeNull();
        const old = line({id: 'velho', at: at(20, 12, 8), session: 'sv', input: 7});
        feed(index, old);
        index.prune(now.getTime());
        expect(index.has('velho')).toBeFalse();
        expect(index.has('h')).toBeTrue();
        feed(index, old);
        index.prune(now.getTime());
        expect(index.summary('30d', now).input).toBe(40);
    });

    it('conta a maior saída de um id repetido, só pela diferença', () => {
        const grows = new ClaudeIndex();
        feed(grows, line({id: 'o', at: at(27, 9), session: 'so', input: 3, output: 5, cacheRead: 100}));
        feed(grows, line({id: 'o', at: at(27, 9), session: 'so', input: 3, output: 12, cacheRead: 100}));
        const shrinks = new ClaudeIndex();
        feed(shrinks, line({id: 'o', at: at(27, 9), session: 'so', input: 3, output: 12, cacheRead: 100}));
        feed(shrinks, line({id: 'o', at: at(27, 9), session: 'so', input: 3, output: 5, cacheRead: 100}));
        for (const index of [grows, shrinks]) {
            const today = index.summary('today', now);
            expect([today.input, today.output, today.cacheRead]).toEqual([3, 12, 100]);
            expect(index.session('so')?.tokens).toBe(15);
            expect(index.session('so')?.contextTokens).toBe(103);
        }
        const copy = ClaudeIndex.fromJSON(JSON.parse(JSON.stringify(grows.toJSON())));
        feed(copy, line({id: 'o', at: at(27, 10), session: 'so', input: 3, output: 20, cacheRead: 100, sidechain: true}));
        expect(copy.summary('today', now).output).toBe(20);
        expect(
            copy
                .summary('today', now)
                .bars.slice(1, 3)
                .map(bar => bar.value),
        ).toEqual([15, 8]);
        expect(copy.session('so')?.tokens).toBe(23);
    });

    it('volta do JSON igual e ignora lixo', () => {
        const index = build();
        const entry = parseAssistantLine(line({id: 't', at: at(27, 9), session: 'sx', todos: ['completed', 'pending']}));
        if (entry) index.add(entry);
        const copy = ClaudeIndex.fromJSON(JSON.parse(JSON.stringify(index.toJSON())));
        expect(copy.summary('7d', now)).toEqual(index.summary('7d', now));
        expect(copy.session('sx')).toEqual(index.session('sx'));
        expect(copy.session('sx')?.todos).toEqual({done: 1, total: 2});
        expect(['m1', 'm4', 'm5'].map(id => copy.has(id))).toEqual([true, true, false]);
        expect(ClaudeIndex.fromJSON('lixo').summary('today', now).total).toBe(0);
        expect(ClaudeIndex.fromJSON({version: 99}).summary('today', now).total).toBe(0);
    });

    it('serializa uma cópia que não muda com o índice', () => {
        const index = build();
        const snapshot = JSON.stringify(index.toJSON());
        const live = index.toJSON();
        const entry = parseAssistantLine(
            line({id: 'n', at: at(27, 9), cwd: '/home/u/dynamic-island', session: 's1', input: 7, todos: ['pending']}),
        );
        if (entry) index.add(entry);
        expect(JSON.stringify(live)).toBe(snapshot);
        expect(JSON.stringify(index.toJSON())).not.toBe(snapshot);
    });
});
