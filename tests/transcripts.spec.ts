import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ClaudeTranscripts} from '../src/features/claude/claude-transcripts-service.js';
import {Timer} from '../src/shared/timer.js';
import type {FrodoSettings} from '../src/settings/frodo-settings.js';
import {createSettings, line} from './fixtures.js';

describe('ClaudeTranscripts', () => {
    const today = new Date();
    let tmp: string;
    let file: string;
    let cachePath: string;
    let settings: FrodoSettings;
    let service: ClaudeTranscripts;

    function write(lines: string[]): void {
        GLib.file_set_contents(file, lines.map(text => `${text}\n`).join(''));
    }

    function append(text: string): void {
        const [, bytes] = GLib.file_get_contents(file);
        GLib.file_set_contents(file, new TextDecoder().decode(bytes) + text);
    }

    beforeEach(() => {
        tmp = GLib.dir_make_tmp('frodo-transcripts-XXXXXX');
        GLib.mkdir_with_parents(`${tmp}/projects/p`, 0o700);
        file = `${tmp}/projects/p/a.jsonl`;
        cachePath = `${tmp}/claude-index.json`;
        settings = createSettings();
        settings.claudeProfiles = [{id: 'p', label: 'P', configDir: tmp}];
        service = new ClaudeTranscripts(settings, cachePath);
    });

    afterEach(() => {
        service.destroy();
        GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(tmp)}`);
    });

    it('conta o que já existe', async () => {
        write([line({id: 'a', at: today, input: 10})]);
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(10);
    });

    it('lê a linha parcial só quando ela termina', async () => {
        write([line({id: 'a', at: today, input: 10})]);
        await service.scan();
        append(line({id: 'b', at: today, input: 5}).slice(0, 20));
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(10);
        append(`${line({id: 'b', at: today, input: 5}).slice(20)}\n`);
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(15);
    });

    it('não conta duas vezes a linha repetida entre passadas', async () => {
        write([line({id: 'a', at: today, input: 10})]);
        await service.scan();
        append(`${line({id: 'a', at: today, input: 10})}\n`);
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(10);
    });

    it('pula o arquivo que encolheu sem contar de novo', async () => {
        write([line({id: 'a', at: today, input: 10}), line({id: 'b', at: today, input: 5})]);
        await service.scan();
        write([line({id: 'c', at: today, input: 1})]);
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(15);
    });

    it('continua do cache em outra instância e refaz cache inválido', async () => {
        write([line({id: 'a', at: today, input: 10})]);
        await service.scan();
        const again = new ClaudeTranscripts(settings, cachePath);
        await again.scan();
        expect(again.index.summary('today', new Date()).input).toBe(10);
        GLib.file_set_contents(cachePath, '{lixo');
        const fresh = new ClaudeTranscripts(settings, cachePath);
        await fresh.scan();
        expect(fresh.index.summary('today', new Date()).input).toBe(10);
    });

    it('refaz o cache cujo índice não volta inteiro', async () => {
        write([line({id: 'a', at: today, input: 10})]);
        await service.scan();
        const [, bytes] = GLib.file_get_contents(cachePath);
        const cache = JSON.parse(new TextDecoder().decode(bytes)) as {index: unknown};
        cache.index = {version: 99};
        GLib.file_set_contents(cachePath, JSON.stringify(cache));
        const fresh = new ClaudeTranscripts(settings, cachePath);
        await fresh.scan();
        expect(fresh.index.summary('today', new Date()).input).toBe(10);
    });

    it('lembra os ids no cache e guarda as tarefas da linha repetida', async () => {
        write([line({id: 'a', at: today, input: 10})]);
        await service.scan();
        const again = new ClaudeTranscripts(settings, cachePath);
        append(`${line({id: 'a', at: today, input: 10, todos: ['completed', 'pending']})}\n`);
        await again.scan();
        expect(again.index.summary('today', new Date()).input).toBe(10);
        expect(again.index.session('s1')?.todos).toEqual({done: 1, total: 2});
    });

    it('não conta de novo o perfil removido e devolvido', async () => {
        write([line({id: 'a', at: today, input: 10})]);
        await service.scan();
        settings.claudeProfiles = [];
        await service.scan();
        settings.claudeProfiles = [{id: 'p', label: 'P', configDir: tmp}];
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(10);
    });

    it('conta uma vez o id copiado para outra sessão, na mesma passada e entre passadas', async () => {
        write([line({id: 'm', at: today, session: 's1', input: 10})]);
        GLib.file_set_contents(`${tmp}/projects/p/b.jsonl`, `${line({id: 'm', at: today, session: 's2', input: 10})}\n`);
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(10);
        GLib.file_set_contents(`${tmp}/projects/p/c.jsonl`, `${line({id: 'm', at: today, session: 's3', input: 10})}\n`);
        const again = new ClaudeTranscripts(settings, cachePath);
        await again.scan();
        expect(again.index.summary('today', new Date()).input).toBe(10);
    });

    it('conta a maior saída do id repetido entre arquivos e passadas', async () => {
        write([line({id: 'm', at: today, input: 1, output: 5})]);
        await service.scan();
        GLib.file_set_contents(`${tmp}/projects/p/b.jsonl`, `${line({id: 'm', at: today, input: 1, output: 12})}\n`);
        const again = new ClaudeTranscripts(settings, cachePath);
        await again.scan();
        append(`${line({id: 'm', at: today, input: 1, output: 7})}\n`);
        await again.scan();
        const summary = again.index.summary('today', new Date());
        expect([summary.input, summary.output]).toEqual([1, 12]);
        expect(again.index.session('s1')?.tokens).toBe(13);
    });

    it('conta quem quer a releitura e só para quando ninguém quer', async () => {
        const every = spyOn(Timer.prototype, 'every').and.callThrough();
        service.setWanted(true);
        service.setWanted(true);
        expect(every).toHaveBeenCalledTimes(1);
        const timer = every.calls.mostRecent().object as Timer;
        service.setWanted(false);
        expect(timer.active).toBeTrue();
        service.setWanted(false);
        expect(timer.active).toBeFalse();
        service.setWanted(false);
        service.setWanted(true);
        expect(timer.active).toBeTrue();
        expect(every).toHaveBeenCalledTimes(2);
        await service.scan();
    });

    it('conta as transcrições dos subagentes', async () => {
        write([line({id: 'a', at: today, input: 10})]);
        GLib.mkdir_with_parents(`${tmp}/projects/p/sid/subagents/workflows/w`, 0o700);
        GLib.file_set_contents(`${tmp}/projects/p/sid/subagents/agent-x.jsonl`, `${line({id: 'x', at: today, input: 7})}\n`);
        GLib.file_set_contents(`${tmp}/projects/p/sid/subagents/workflows/w/agent-y.jsonl`, `${line({id: 'y', at: today, input: 3})}\n`);
        GLib.file_set_contents(`${tmp}/projects/p/sid/fora.jsonl`, `${line({id: 'z', at: today, input: 100})}\n`);
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(20);
    });

    it('grava o cache no máximo a cada 5 min enquanto querem, ao soltar e ao destruir', async () => {
        const start = Date.now();
        const now = spyOn(Date, 'now').and.returnValue(start);
        const writes = spyOn(Gio.File.prototype, 'replace_contents_bytes_async').and.callThrough();
        const settled = (): Promise<unknown> => writes.calls.mostRecent().returnValue as Promise<unknown>;
        write([line({id: 'a', at: today, input: 10})]);
        service.setWanted(true);
        await service.scan();
        expect(writes).toHaveBeenCalledTimes(1);
        append(`${line({id: 'b', at: today, input: 5})}\n`);
        await service.scan();
        expect(writes).toHaveBeenCalledTimes(1);
        now.and.returnValue(start + 5 * 60 * 1000);
        append(`${line({id: 'c', at: today, input: 1})}\n`);
        await service.scan();
        expect(writes).toHaveBeenCalledTimes(2);
        append(`${line({id: 'd', at: today, input: 1})}\n`);
        await service.scan();
        expect(writes).toHaveBeenCalledTimes(2);
        service.setWanted(false);
        service.setWanted(false);
        expect(writes).toHaveBeenCalledTimes(3);
        await settled();
        const again = new ClaudeTranscripts(settings, cachePath);
        await again.scan();
        expect(again.index.summary('today', new Date()).input).toBe(17);
        expect(writes).toHaveBeenCalledTimes(3);

        service.setWanted(true);
        append(`${line({id: 'e', at: today, input: 2})}\n`);
        await service.scan();
        expect(writes).toHaveBeenCalledTimes(3);
        service.destroy();
        expect(writes).toHaveBeenCalledTimes(4);
        await settled();
        const last = new ClaudeTranscripts(settings, cachePath);
        await last.scan();
        expect(last.index.summary('today', new Date()).input).toBe(19);
    });

    it('lê a linha que cruza o pedaço de 1 MiB na mesma passada', async () => {
        write([line({id: 'a', at: today, input: 10, cwd: `/${'x'.repeat(1024 * 1024 + 100)}`}), line({id: 'b', at: today, input: 5})]);
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(15);
        await service.scan();
        expect(service.index.summary('today', new Date()).input).toBe(15);
        const again = new ClaudeTranscripts(settings, cachePath);
        await again.scan();
        expect(again.index.summary('today', new Date()).input).toBe(15);
    });

    it('reaproveita a passada em curso', async () => {
        write([line({id: 'a', at: today, input: 10})]);
        const first = service.scan();
        expect(service.scanning).toBeTrue();
        expect(service.scan()).toBe(first);
        await first;
        expect(service.scanning).toBeFalse();
        expect(service.index.summary('today', new Date()).input).toBe(10);
    });
});
