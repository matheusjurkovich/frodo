import GLib from 'gi://GLib';

import {ClaudeSessions} from './claude-sessions-service.js';
import {Timer} from '../../shared/timer.js';
import {createSettings} from '../../../tests/fixtures.js';

function changed(sessions: ClaudeSessions): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = new Timer();
        const off = sessions.on('changed', () => {
            timer.stop();
            off();
            resolve();
        });
        timer.once(2000, () => {
            off();
            reject(new Error('sem changed em 2 s'));
        });
    });
}

describe('ClaudeSessions', () => {
    const settings = createSettings();
    settings.claudeProfiles = [{id: 't', label: 'T', configDir: '/nonexistent/frodo-sessions'}];
    const self = Number(GLib.file_read_link('/proc/self'));
    const dead = Number(new TextDecoder().decode(GLib.file_get_contents('/proc/sys/kernel/pid_max')[1]).trim());
    let dirs: string[] = [];

    function tmp(): string {
        const dir = GLib.dir_make_tmp('frodo-sessions-XXXXXX');
        dirs.push(dir);
        return dir;
    }

    afterEach(() => {
        for (const dir of dirs) GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(dir)}`);
        dirs = [];
    });

    it('cria a pasta que não existe', () => {
        const dir = `${tmp()}/nova`;
        const sessions = new ClaudeSessions(settings, dir);
        for (const sub of ['sessions', 'pending', 'decisions']) expect(GLib.file_test(`${dir}/${sub}`, GLib.FileTest.IS_DIR)).toBeTrue();
        sessions.destroy();
    });

    it('lê a pasta, ignora lixo e descarta sessão morta', async () => {
        const dir = tmp();
        GLib.mkdir_with_parents(`${dir}/sessions`, 0o700);
        GLib.file_set_contents(
            `${dir}/sessions/a.json`,
            JSON.stringify({pid: self, event: {session_id: 'a', cwd: '/r/x', transcript_path: '/t', hook_event_name: 'Stop'}}),
        );
        GLib.file_set_contents(`${dir}/sessions/b.json`, '{');
        GLib.file_set_contents(
            `${dir}/sessions/c.json`,
            JSON.stringify({pid: dead, event: {session_id: 'c', cwd: '/r/y', transcript_path: '/t', hook_event_name: 'Stop'}}),
        );
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        expect(sessions.sessions.map(state => state.sessionId)).toEqual(['a']);
        expect(GLib.file_test(`${dir}/sessions/c.json`, GLib.FileTest.EXISTS)).toBeFalse();
        sessions.destroy();
    });

    it('segue arquivos novos e o fim da sessão', async () => {
        const dir = tmp();
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        const write = (name: string): void => {
            GLib.file_set_contents(
                `${dir}/sessions/d.json`,
                JSON.stringify({pid: self, event: {session_id: 'd', cwd: '/r/z', transcript_path: '/t', hook_event_name: name}}),
            );
        };
        write('UserPromptSubmit');
        await changed(sessions);
        expect(sessions.sessions[0]?.status).toBe('working');
        write('SessionEnd');
        await changed(sessions);
        expect(sessions.sessions).toEqual([]);
        sessions.destroy();
    });

    it('listener que falha uma vez não para as atualizações', async () => {
        const dir = tmp();
        const log = spyOn(globalThis, 'logError');
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        const first = changed(sessions);
        let failed = false;
        sessions.on('changed', () => {
            if (failed) return;
            failed = true;
            throw new Error('listener quebrado');
        });
        const write = (name: string): void => {
            GLib.file_set_contents(
                `${dir}/sessions/e.json`,
                JSON.stringify({pid: self, event: {session_id: 'e', cwd: '/r/e', transcript_path: '/t', hook_event_name: name}}),
            );
        };
        write('UserPromptSubmit');
        await first;
        write('SessionEnd');
        await changed(sessions);
        expect(sessions.sessions).toEqual([]);
        expect(log).toHaveBeenCalledTimes(1);
        sessions.destroy();
    });

    function pendingFile(dir: string, name: string, pid: number, since: number): void {
        GLib.mkdir_with_parents(`${dir}/pending`, 0o700);
        GLib.file_set_contents(`${dir}/pending/${name}.json`, JSON.stringify({pid, tool: 'Bash', since}));
    }

    it('lista pedido pendente com pid vivo e ignora pid morto', async () => {
        const dir = tmp();
        pendingFile(dir, 's.r1', self, 10);
        pendingFile(dir, 's.r2', dead, 20);
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        expect(sessions.pending.map(pending => pending.key)).toEqual(['s.r1']);
        sessions.destroy();
    });

    it('segue pedido novo e pedido apagado pelo hook', async () => {
        const dir = tmp();
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        pendingFile(dir, 's.r1', self, 10);
        await changed(sessions);
        expect(sessions.pending.map(pending => pending.key)).toEqual(['s.r1']);
        GLib.unlink(`${dir}/pending/s.r1.json`);
        await changed(sessions);
        expect(sessions.pending).toEqual([]);
        sessions.destroy();
    });

    it('pendingFor devolve o mais antigo da sessão', async () => {
        const dir = tmp();
        pendingFile(dir, 's.r1', self, 20);
        pendingFile(dir, 's.r2', self, 10);
        pendingFile(dir, 't.r3', self, 5);
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        expect(sessions.pendingFor('s')?.key).toBe('s.r2');
        expect(sessions.pendingFor('x')).toBeNull();
        sessions.destroy();
    });

    it('decide grava o arquivo de decisão e tira o pedido na hora', async () => {
        const dir = tmp();
        pendingFile(dir, 's.r1', self, 10);
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        const pending = sessions.pendingFor('s');
        if (!pending) throw new Error('sem pedido');
        expect(sessions.decide(pending, 'allow')).toBeTrue();
        expect(sessions.pending).toEqual([]);
        const [, bytes] = GLib.file_get_contents(`${dir}/decisions/s.r1.json`);
        expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({behavior: 'allow'});
        sessions.destroy();
    });

    it('decide devolve false e não grava nada quando o hook já saiu', async () => {
        const dir = tmp();
        pendingFile(dir, 's.r1', self, 10);
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        const pending = sessions.pendingFor('s');
        if (!pending) throw new Error('sem pedido');
        expect(sessions.decide({...pending, pid: dead}, 'deny')).toBeFalse();
        expect(GLib.file_test(`${dir}/decisions/s.r1.json`, GLib.FileTest.EXISTS)).toBeFalse();
        sessions.destroy();
    });

    it('marca a extensão viva com o pid do shell e desmarca ao destruir', () => {
        const dir = tmp();
        const sessions = new ClaudeSessions(settings, dir);
        const [, bytes] = GLib.file_get_contents(`${dir}/alive`);
        expect(new TextDecoder().decode(bytes).trim()).toBe(String(self));
        sessions.destroy();
        expect(GLib.file_test(`${dir}/alive`, GLib.FileTest.EXISTS)).toBeFalse();
    });

    it('não apaga a marca de outro shell ao destruir', () => {
        const dir = tmp();
        const sessions = new ClaudeSessions(settings, dir);
        GLib.file_set_contents(`${dir}/alive`, '1\n');
        sessions.destroy();
        expect(GLib.file_test(`${dir}/alive`, GLib.FileTest.EXISTS)).toBeTrue();
    });
});
