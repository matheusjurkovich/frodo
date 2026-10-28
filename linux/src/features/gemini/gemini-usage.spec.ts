import {
    geminiMeters,
    GEMINI_MODELS,
    geminiCells,
    geminiQuota,
    nextPacificReset,
    pacificDayStart,
    parseGeminiSession,
    parseProjects,
    projectName,
} from './gemini-usage.js';

const at = (minute: number): string => new Date(2026, 9, 27, 10, minute).toISOString();
const tokens = {input: 1000, output: 30, cached: 600, thoughts: 70, tool: 5, total: 1105};

const messages = [
    {id: 'u1', timestamp: at(0), type: 'user', content: 'oi'},
    {id: 'g1', timestamp: at(1), type: 'gemini', model: 'gemini-3.1-pro-preview', tokens},
    {id: 'g2', timestamp: at(2), type: 'gemini', model: 'gemini-3-flash-preview', tokens: null},
    {id: 'i1', timestamp: at(3), type: 'info', content: 'x'},
];

const meta = {sessionId: 'sess-1', projectHash: 'abc', startTime: at(0), lastUpdated: at(3)};

describe('gemini-usage', () => {
    it('lê o formato JSON antigo', () => {
        const session = parseGeminiSession(JSON.stringify({...meta, messages}));
        expect(session?.id).toBe('sess-1');
        expect(session?.requests).toEqual([
            {id: 'g1', at: Date.parse(at(1)), model: 'gemini-3.1-pro-preview', input: 405, output: 100, cacheRead: 600},
        ]);
    });

    it('lê o JSONL do 0.58 e fica com a última versão de cada mensagem', () => {
        const lines = [
            meta,
            ...messages,
            {$set: {lastUpdated: at(4)}},
            {...messages[2], tokens: {...tokens, cached: 0}},
            {$rewindTo: 'g1'},
            'linha quebrada {',
        ];
        const session = parseGeminiSession(lines.map(line => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n'));
        expect(session?.requests.map(request => [request.id, request.input, request.output])).toEqual([
            ['g1', 405, 100],
            ['g2', 1005, 100],
        ]);
    });

    it('descarta arquivo sem sessionId', () => {
        expect(parseGeminiSession('{}')).toBeNull();
        expect(parseGeminiSession('nada')).toBeNull();
        expect(parseGeminiSession(JSON.stringify(meta))?.requests).toEqual([]);
    });

    it('agrupa pedidos em células por hora', () => {
        const session = parseGeminiSession(JSON.stringify({...meta, messages: [messages[1], {...messages[1], id: 'g3'}]}));
        const cells = geminiCells(session?.requests ?? [], 'frodo', 'sess-1');
        expect(cells.map(cell => [cell.model, cell.project, cell.session, cell.input, cell.output, cell.cacheRead])).toEqual([
            ['gemini-3.1-pro-preview', 'frodo', 'sess-1', 810, 200, 1200],
        ]);
    });

    it('nomeia o projeto pela pasta ou pelo hash conhecido', () => {
        const hash = 'a'.repeat(64);
        expect(parseProjects(JSON.stringify({projects: {'/home/u/frodo': 'frodo', '/x': 3}}))).toEqual([['/home/u/frodo', 'frodo']]);
        expect(parseProjects(null)).toEqual([]);
        expect(projectName('nazgul', new Map())).toBe('nazgul');
        expect(projectName(hash, new Map([[hash, 'frodo']]))).toBe('frodo');
        expect(projectName('b'.repeat(64), new Map())).toBe('outro');
    });

    it('acha a meia-noite do Pacífico no horário de verão e no padrão', () => {
        const pdt = Date.parse('2026-07-15T10:00:00Z');
        expect(pacificDayStart(pdt)).toBe(Date.parse('2026-07-15T07:00:00Z'));
        expect(nextPacificReset(pdt)).toBe(Date.parse('2026-07-16T07:00:00Z'));
        const pst = Date.parse('2026-01-15T05:00:00Z');
        expect(pacificDayStart(pst)).toBe(Date.parse('2026-01-14T08:00:00Z'));
        expect(nextPacificReset(pst)).toBe(Date.parse('2026-01-15T08:00:00Z'));
    });

    it('acerta os dias em que o horário de verão muda', () => {
        const spring = Date.parse('2026-03-08T12:00:00Z');
        expect(pacificDayStart(spring)).toBe(Date.parse('2026-03-08T08:00:00Z'));
        expect(nextPacificReset(spring)).toBe(Date.parse('2026-03-09T07:00:00Z'));
        const fall = Date.parse('2026-11-01T20:00:00Z');
        expect(pacificDayStart(fall)).toBe(Date.parse('2026-11-01T07:00:00Z'));
        expect(nextPacificReset(fall)).toBe(Date.parse('2026-11-02T08:00:00Z'));
    });

    it('conta pedidos do dia do Pacífico e do último minuto', () => {
        const now = Date.parse('2026-07-15T10:00:00Z');
        const times = [Date.parse('2026-07-15T06:59:59Z'), Date.parse('2026-07-15T07:00:00Z'), now - 61_000, now - 30_000, now, now + 1000];
        expect(geminiQuota(times, 1000, now)).toEqual({
            requests: 4,
            limit: 1000,
            perMinute: 2,
            resetsAt: Date.parse('2026-07-16T07:00:00Z'),
        });
    });

    it('agrupa e rotula os modelos', () => {
        const models = [
            'gemini-3.1-pro-preview',
            'gemini-3-flash-preview',
            'gemini-2.5-flash-lite',
            'gemini-2.5-pro-preview-05-06',
            'gemma-3',
        ];
        expect(models.map(GEMINI_MODELS.family)).toEqual(['gemini-pro', 'gemini-flash', 'gemini-flash', 'gemini-pro', 'gemini-other']);
        expect(models.map(GEMINI_MODELS.label)).toEqual([
            'Gemini 3.1 Pro',
            'Gemini 3 Flash',
            'Gemini 2.5 Flash Lite',
            'Gemini 2.5 Pro',
            'gemma-3',
        ]);
    });

    it('estima a cota diária e por minuto', () => {
        const [daily, minute] = geminiMeters({requests: 412, limit: 1000, perMinute: 12, resetsAt: new Date(2026, 9, 28, 4, 0).getTime()});
        expect(daily?.percent).toBeCloseTo(41.2);
        expect(daily?.note).toBe('412 de 1.000 · reinicia às 04:00');
        expect(minute?.percent).toBe(20);
        expect(geminiMeters(null)).toEqual([]);
    });
});
