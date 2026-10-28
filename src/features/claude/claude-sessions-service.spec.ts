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
        expect(GLib.file_test(dir, GLib.FileTest.IS_DIR)).toBeTrue();
        sessions.destroy();
    });

    it('lê a pasta, ignora lixo e descarta sessão morta', async () => {
        const dir = tmp();
        GLib.file_set_contents(
            `${dir}/a.json`,
            JSON.stringify({pid: self, event: {session_id: 'a', cwd: '/r/x', transcript_path: '/t', hook_event_name: 'Stop'}}),
        );
        GLib.file_set_contents(`${dir}/b.json`, '{');
        GLib.file_set_contents(
            `${dir}/c.json`,
            JSON.stringify({pid: dead, event: {session_id: 'c', cwd: '/r/y', transcript_path: '/t', hook_event_name: 'Stop'}}),
        );
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        expect(sessions.sessions.map(state => state.sessionId)).toEqual(['a']);
        expect(GLib.file_test(`${dir}/c.json`, GLib.FileTest.EXISTS)).toBeFalse();
        sessions.destroy();
    });

    it('segue arquivos novos e o fim da sessão', async () => {
        const dir = tmp();
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        const write = (name: string): void => {
            GLib.file_set_contents(
                `${dir}/d.json`,
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
                `${dir}/e.json`,
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
});
