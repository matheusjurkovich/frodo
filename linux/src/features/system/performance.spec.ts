import {
    averageMhz,
    busiest,
    cpuUsage,
    engineBusy,
    formatBytes,
    formatPercent,
    formatRate,
    isProtected,
    mergeEngines,
    monogram,
    parseCpuStat,
    parseDiskStats,
    parseDrmFdinfo,
    parseProcStat,
    parseSwap,
    pushHistory,
    topBy,
} from './performance.js';

const STAT = 'cpu  100 0 50 800 50 0 0 0 0 0\ncpu0 50 0 25 400 25 0 0 0 0 0\ncpu1 50 0 25 400 25 0 0 0 0 0\nintr 1';

describe('desempenho', () => {
    it('lê o tempo de cpu e os núcleos', () => {
        expect(parseCpuStat(STAT)).toEqual({times: {busy: 150, total: 1000}, cores: 2});
        expect(parseCpuStat('intr 1')).toBeNull();
    });

    it('calcula o uso de cpu pela diferença entre amostras', () => {
        expect(cpuUsage({busy: 150, total: 1000}, {busy: 200, total: 1100})).toBeCloseTo(0.5);
        expect(cpuUsage({busy: 150, total: 1000}, {busy: 150, total: 1000})).toBe(0);
    });

    it('faz a média da frequência', () => {
        expect(averageMhz('cpu MHz\t\t: 1000.0\nx\ncpu MHz\t\t: 3000.0\n')).toBe(2000);
        expect(averageMhz('')).toBeNull();
    });

    it('lê o swap', () => {
        expect(parseSwap('SwapTotal:  4000 kB\nSwapFree:   3600 kB\n')).toEqual({totalKb: 4000, usedKb: 400});
    });

    it('soma leitura e escrita só dos discos inteiros', () => {
        const text = [
            ' 259       0 nvme0n1 3305174 1195716 68801686 452794 409845 612245 30939132 718112 0 0 0',
            ' 259       1 nvme0n1p1 10 0 999 0 10 0 999 0 0 0 0',
            '   7       0 loop0 10 0 999 0 0 0 0 0 0 0 0',
        ].join('\n');
        expect(parseDiskStats(text)).toEqual({readSectors: 68801686, writeSectors: 30939132});
    });

    it('lê o stat do processo, inclusive nome com espaço e parênteses', () => {
        const text = '4182 (Web Content (x)) S 1 2 3 0 -1 4194304 1 2 3 4 1500 300 0 0 20 0 29 0 29940 9621868544 62300 1844';
        expect(parseProcStat(text)).toEqual({pid: 4182, name: 'Web Content (x)', ticks: 1800, rssPages: 62300});
        expect(parseProcStat('lixo')).toBeNull();
    });

    it('lê o fdinfo do drm e soma clientes sem repetir', () => {
        const fdinfo =
            'drm-driver:\ti915\ndrm-client-id:\t28\ndrm-engine-render:\t500 ns\ndrm-engine-video:\t100 ns\ndrm-engine-capacity-video:\t2\n';
        const client = parseDrmFdinfo(fdinfo);
        expect(client).toEqual({id: '28', driver: 'i915', engines: {render: 500, video: 100}, capacity: {video: 2}});
        expect(parseDrmFdinfo('pos: 0\nflags: 02\n')).toBeNull();
        if (!client) return;
        expect(mergeEngines([client, client, {...client, id: '29'}])).toEqual({render: 1000, video: 200});
    });

    it('calcula a ocupação de cada motor da gpu e pega a maior', () => {
        const busy = engineBusy({render: 0, video: 0}, {render: 500, video: 1000}, 1000, {video: 2});
        expect(busy).toEqual({render: 0.5, video: 0.5});
        expect(busiest({render: 0.2, video: 0.7})).toBe(0.7);
        expect(busiest({render: 3})).toBe(1);
        expect(busiest({})).toBe(0);
        expect(engineBusy({render: 900}, {render: 100}, 1000)).toEqual({});
    });

    it('protege processo de outro usuário e os essenciais da sessão', () => {
        expect(isProtected('firefox', 1000, 1000)).toBeFalse();
        expect(isProtected('firefox', 0, 1000)).toBeTrue();
        expect(isProtected('gnome-shell', 1000, 1000)).toBeTrue();
    });

    it('ordena e corta o topo', () => {
        expect(topBy([3, 9, 1, 7], value => value, 2)).toEqual([9, 7]);
    });

    it('mantém o histórico no tamanho pedido', () => {
        expect(pushHistory([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    });

    it('formata bytes, taxa, porcentagem e monograma em pt-BR', () => {
        expect(formatBytes(9.4 * 1024 ** 3)).toBe('9,4 GB');
        expect(formatBytes(730 * 1024 ** 2)).toBe('730 MB');
        expect(formatBytes(334.2 * 1024 ** 3)).toBe('334 GB');
        expect(formatRate(12 * 1024 ** 2)).toBe('12 MB/s');
        expect(formatRate(300 * 1024)).toBe('300 kB/s');
        expect(formatPercent(0.184)).toBe('18,4%');
        expect(monogram('firefox')).toBe('Fi');
        expect(monogram('VS Code')).toBe('Vs');
    });
});
