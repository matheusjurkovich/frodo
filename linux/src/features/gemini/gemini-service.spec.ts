import GLib from 'gi://GLib';

import {GeminiUsage} from './gemini-service.js';
import {createSettings, removeDirs, tmpDir, waitFor, writeFile} from '../../../tests/fixtures.js';

const SECOND = 1000;
const DAY = 24 * 3600e3;

interface Ask {
    readonly id: string;
    readonly ago: number;
    readonly input?: number;
    readonly output?: number;
}

function session(sessionId: string, asks: readonly Ask[]): string {
    return JSON.stringify({
        sessionId,
        messages: asks.map(({id, ago, input = 100, output = 10}) => ({
            id,
            timestamp: new Date(Date.now() - ago).toISOString(),
            type: 'gemini',
            model: 'gemini-3.1-pro-preview',
            tokens: {input, output, cached: 0, thoughts: 0, tool: 0},
        })),
    });
}

const hash = (path: string): string => GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, path, -1) ?? '';

describe('GeminiUsage', () => {
    const settings = createSettings();
    const dirs: string[] = [];
    const services: GeminiUsage[] = [];

    function create(root: string): GeminiUsage {
        const service = new GeminiUsage(settings, root);
        services.push(service);
        return service;
    }

    beforeEach(() => {
        settings.setProviderEnabled('gemini', false);
        settings.geminiDailyLimit = 1000;
    });

    afterEach(() => {
        for (const service of services.splice(0)) service.destroy();
        removeDirs(dirs);
    });

    it('sem a pasta tmp fica indisponível e sem cota', async () => {
        const gemini = create(tmpDir(dirs));
        await gemini.refresh();
        expect(gemini.available).toBeFalse();
        expect(gemini.quota).toBeNull();
    });

    it('só mostra cota depois da primeira leitura', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/tmp/frodo/chats/s1.json`, session('s1', [{id: 'g1', ago: 10 * SECOND}]));
        const gemini = create(root);
        expect(gemini.available).toBeTrue();
        expect(gemini.quota).toBeNull();
        await gemini.refresh();
        expect(gemini.quota?.requests).toBe(1);
    });

    it('conta os pedidos de hoje e do último minuto, uma vez cada', async () => {
        const root = tmpDir(dirs);
        const asks = [
            {id: 'g1', ago: 10 * SECOND},
            {id: 'g2', ago: 5 * 60 * SECOND},
            {id: 'g3', ago: 3 * DAY},
        ];
        writeFile(`${root}/tmp/frodo/chats/s1.json`, session('s1', asks));
        writeFile(`${root}/tmp/frodo/chats/s1/copia.jsonl`, session('s1', asks.slice(0, 1)));
        writeFile(`${root}/tmp/frodo/chats/notas.txt`, session('s9', [{id: 'g9', ago: SECOND}]));
        const gemini = create(root);
        await gemini.refresh();
        expect(gemini.quota).toEqual(jasmine.objectContaining({requests: 2, perMinute: 1, limit: 1000}));
    });

    it('trocar o limite diário avisa e muda a cota', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/tmp/frodo/chats/s1.json`, session('s1', [{id: 'g1', ago: 10 * SECOND}]));
        const gemini = create(root);
        await gemini.refresh();
        const changed = waitFor(gemini, () => gemini.quota?.limit === 50);
        settings.geminiDailyLimit = 50;
        await changed;
    });

    it('com o provedor ligado atualiza sozinho', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/tmp/frodo/chats/s1.json`, session('s1', [{id: 'g1', ago: 10 * SECOND}]));
        const gemini = create(root);
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(gemini.lastRefresh).toBe(0);
        settings.setProviderEnabled('gemini', true);
        await waitFor(gemini, () => gemini.quota?.requests === 1);
    });

    it('scan nomeia o projeto pelo projects.json e agrupa subagentes na sessão pai', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/projects.json`, JSON.stringify({projects: {'/home/u/frodo': 'frodo', '/home/u/x': 7}}));
        writeFile(`${root}/tmp/${hash('/home/u/frodo')}/chats/s1.json`, session('s1', [{id: 'g1', ago: 60 * SECOND, input: 100}]));
        writeFile(`${root}/tmp/${hash('/home/u/frodo')}/chats/s1/sub.json`, session('sub', [{id: 'g2', ago: 50 * SECOND, input: 200}]));
        writeFile(`${root}/tmp/${hash('/home/u/x')}/chats/s2.json`, session('s2', [{id: 'g3', ago: 40 * SECOND, input: 400}]));
        writeFile(`${root}/tmp/meu-projeto/chats/s3.json`, session('s3', [{id: 'g4', ago: 30 * SECOND, input: 800}]));
        writeFile(`${root}/tmp/arquivo-solto.json`, session('s4', [{id: 'g5', ago: 30 * SECOND, input: 1600}]));
        const gemini = create(root);
        await gemini.scan();
        const summary = gemini.summary('7d', new Date());
        expect(summary.input).toBe(1500);
        expect(summary.sessions).toBe(3);
        expect(summary.projects.map(project => [project.name, project.tokens])).toEqual([
            ['meu-projeto', 810],
            ['outro', 410],
            ['frodo', 320],
        ]);
    });

    it('scan ignora arquivo velho e esquece o apagado', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/tmp/p/chats/a.json`, session('a', [{id: 'g1', ago: 60 * SECOND}]));
        writeFile(`${root}/tmp/p/chats/b.json`, session('b', [{id: 'g2', ago: 60 * SECOND}]), Date.now() - 40 * DAY);
        const gemini = create(root);
        await gemini.scan();
        expect(gemini.summary('7d', new Date()).total).toBe(110);
        removeDirs([`${root}/tmp/p/chats/a.json`]);
        await gemini.scan();
        expect(gemini.summary('7d', new Date()).total).toBe(0);
    });

    it('scan relê o arquivo que mudou', async () => {
        const root = tmpDir(dirs);
        const path = `${root}/tmp/p/chats/a.json`;
        writeFile(path, session('a', [{id: 'g1', ago: 60 * SECOND}]), Date.now() - 60 * SECOND);
        const gemini = create(root);
        await gemini.scan();
        writeFile(
            path,
            session('a', [
                {id: 'g1', ago: 60 * SECOND},
                {id: 'g2', ago: 10 * SECOND},
            ]),
        );
        await gemini.scan();
        expect(gemini.summary('7d', new Date()).total).toBe(220);
    });

    it('scan lê só o que o JSONL ganhou e espera a linha incompleta terminar', async () => {
        const root = tmpDir(dirs);
        const path = `${root}/tmp/p/chats/a.jsonl`;
        const line = (id: string, ago: number): string =>
            JSON.stringify({
                id,
                timestamp: new Date(Date.now() - ago).toISOString(),
                type: 'gemini',
                model: 'gemini-3.1-pro-preview',
                tokens: {input: 100, output: 10, cached: 0, thoughts: 0, tool: 0},
            });
        const head = `${JSON.stringify({sessionId: 'a'})}\n${line('g1', 60 * SECOND)}\n`;
        const second = line('g2', 10 * SECOND);
        writeFile(path, head, Date.now() - 60 * SECOND);
        const gemini = create(root);
        await gemini.scan();
        expect(gemini.summary('7d', new Date()).total).toBe(110);
        writeFile(path, `${head}${second.slice(0, 20)}`);
        await gemini.scan();
        expect(gemini.summary('7d', new Date()).total).toBe(110);
        writeFile(path, `${head}${second}\n`);
        await gemini.scan();
        expect(gemini.summary('7d', new Date()).total).toBe(220);
    });

    it('scan com pasta ilegível não esquece o que já leu', async () => {
        const root = tmpDir(dirs);
        const chats = `${root}/tmp/p/chats`;
        writeFile(`${chats}/a.json`, session('a', [{id: 'g1', ago: 60 * SECOND}]));
        const gemini = create(root);
        await gemini.scan();
        GLib.chmod(chats, 0);
        try {
            await gemini.scan();
            expect(gemini.summary('7d', new Date()).total).toBe(110);
        } finally {
            GLib.chmod(chats, 0o700);
        }
    });

    it('refresh descarta o que saiu da janela de 30 dias', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/tmp/p/chats/a.json`, session('a', [{id: 'g1', ago: 60 * SECOND}]), Date.now() - 20 * DAY);
        const gemini = create(root);
        await gemini.scan();
        expect(gemini.summary('7d', new Date()).total).toBe(110);
        const real = Date.now();
        spyOn(Date, 'now').and.returnValue(real + 11 * DAY);
        await gemini.refresh();
        expect(gemini.summary('7d', new Date()).total).toBe(0);
    });

    it('refresh e scan ao mesmo tempo terminam com o mesmo resultado', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/tmp/p/chats/a.json`, session('a', [{id: 'g1', ago: 60 * SECOND}]));
        const gemini = create(root);
        await Promise.all([gemini.refresh(), gemini.scan()]);
        expect(gemini.summary('7d', new Date()).total).toBe(110);
        expect(gemini.quota?.requests).toBe(1);
    });
});
