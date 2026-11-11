import GLib from 'gi://GLib';

import {ClaudeService} from './claude-service.js';
import {PROFILE_URL, USAGE_URL} from './claude-client.const.js';
import type {HttpRequest, HttpResponse} from './claude-client.types.js';
import {STALE_USAGE_MESSAGE} from './claude-usage.const.js';
import {createSettings, removeDirs, tmpDir, waitFor, writeFile} from '../../../tests/fixtures.js';

const USAGE = {five_hour: {utilization: 42}, seven_day: {utilization: 7}};
const PROFILE = {
    account: {display_name: 'Ana'},
    application: {name: 'Claude'},
    organization: {organization_type: 'claude_max', rate_limit_tier: 'default_claude_max_20x', subscription_status: 'active'},
};

describe('ClaudeService', () => {
    const settings = createSettings();
    const dirs: string[] = [];
    let services: ClaudeService[] = [];
    let responses: Record<string, HttpResponse>;
    let calls: HttpRequest[];

    function signIn(dir: string, token: string, expiresAt = Date.now() + 3600e3): void {
        writeFile(`${dir}/.credentials.json`, JSON.stringify({claudeAiOauth: {accessToken: token, refreshToken: 'r', expiresAt}}));
    }

    function answer(token: string, usage: HttpResponse, profile: HttpResponse = {status: 200, body: JSON.stringify(PROFILE)}): void {
        responses[`${token} ${USAGE_URL}`] = usage;
        responses[`${token} ${PROFILE_URL}`] = profile;
    }

    function ok(body: unknown = USAGE): HttpResponse {
        return {status: 200, body: JSON.stringify(body)};
    }

    async function start(...configDirs: string[]): Promise<ClaudeService> {
        settings.claudeProfiles = configDirs.map((configDir, i) => ({id: `p${i}`, label: `P${i}`, configDir}));
        const service = new ClaudeService(settings, request => {
            calls.push(request);
            return Promise.resolve(responses[`${request.token} ${request.url}`] ?? {status: 500, body: ''});
        });
        services.push(service);
        await waitFor(service, () => service.profiles.length === configDirs.length && service.profiles.every(p => p.status !== 'loading'));
        await service.refresh();
        return service;
    }

    beforeEach(() => {
        responses = {};
        calls = [];
    });

    afterEach(() => {
        for (const service of services) service.destroy();
        services = [];
        removeDirs(dirs);
    });

    it('lê uso e perfil e monta janelas, assinatura e plano', async () => {
        const dir = tmpDir(dirs);
        signIn(dir, 'a');
        answer('a', ok());
        const claude = await start(dir);
        const usage = claude.active;
        expect(usage?.status).toBe('ok');
        expect(usage?.windows.map(window => [window.role, window.utilization])).toEqual([
            ['session', 42],
            ['weekly', 7],
        ]);
        expect(usage?.subtitle).toBe('Ana · Claude · ativo');
        expect(usage?.tier).toBe('MAX 20x');
        expect(usage?.error).toBeNull();
        expect(usage?.updatedAt).toBeGreaterThan(0);
        expect(claude.lastFailed).toBeFalse();
    });

    it('perfil sem credenciais fica sem login e não chama a API', async () => {
        const claude = await start(tmpDir(dirs));
        expect(claude.active?.status).toBe('signed-out');
        expect(claude.active?.error).toBe('Sem login do Claude Code neste perfil.');
        expect(calls).toEqual([]);
    });

    it('refresh simultâneo reaproveita a execução em andamento e lê as credenciais uma vez', async () => {
        const dir = tmpDir(dirs);
        signIn(dir, 'a');
        answer('a', ok());
        const claude = await start(dir);
        calls = [];
        await Promise.all([claude.refresh(true), claude.refresh(true), claude.refresh(true)]);
        expect(calls.length).toBe(2);
    });

    it('marca falha geral só quando todos os perfis dão erro', async () => {
        const good = tmpDir(dirs);
        const bad = tmpDir(dirs);
        signIn(good, 'g');
        signIn(bad, 'b');
        answer('g', ok());
        answer('b', {status: 500, body: ''});
        const claude = await start(good, bad);
        await claude.refresh(true);
        expect(claude.profiles.map(usage => usage.status)).toEqual(['ok', 'error']);
        expect(claude.profiles[1]?.error).toBe('Erro do Claude (HTTP 500).');
        expect(claude.lastFailed).toBeFalse();
        answer('g', {status: 403, body: JSON.stringify({error: {message: 'sem plano'}})});
        await claude.refresh(true);
        expect(claude.profiles[0]?.error).toBe('sem plano');
        expect(claude.lastFailed).toBeTrue();
    });

    it('429 depois de uma leitura boa mantém os dados sem erro', async () => {
        const dir = tmpDir(dirs);
        signIn(dir, 'a');
        answer('a', ok());
        const claude = await start(dir);
        answer('a', {status: 429, body: ''});
        await claude.refresh(true);
        expect(claude.active?.status).toBe('ok');
        expect(claude.active?.error).toBeNull();
        expect(claude.active?.windows.length).toBe(2);
    });

    it('429 sem leitura boa vira erro', async () => {
        const dir = tmpDir(dirs);
        signIn(dir, 'a');
        answer('a', {status: 429, body: ''});
        const claude = await start(dir);
        expect(claude.active?.status).toBe('error');
        expect(claude.active?.error).toBe('Limite de requisições do Claude; tentando de novo em breve.');
    });

    it('token vencido mostra o uso antigo como desatualizado ou erro sem dados', async () => {
        const fresh = tmpDir(dirs);
        const expired = tmpDir(dirs);
        signIn(fresh, 'a');
        signIn(expired, 'x', Date.now() - 1000);
        answer('a', ok());
        const claude = await start(fresh, expired);
        expect(claude.profiles[1]?.status).toBe('error');
        expect(claude.profiles[1]?.error).toBe(STALE_USAGE_MESSAGE);
        signIn(fresh, 'a', Date.now() - 1000);
        await claude.refresh(true);
        expect(claude.profiles[0]?.status).toBe('ok');
        expect(claude.profiles[0]?.error).toBe(STALE_USAGE_MESSAGE);
        expect(claude.profiles[0]?.windows.length).toBe(2);
    });

    it('não repete a leitura em menos de um minuto sem forçar', async () => {
        const dir = tmpDir(dirs);
        signIn(dir, 'a');
        answer('a', ok());
        const claude = await start(dir);
        const before = calls.length;
        await claude.refresh();
        expect(calls.length).toBe(before);
        claude.refreshIfStale(0);
        await waitFor(claude, () => calls.length > before);
    });

    it('o primeiro perfil é o ativo quando nenhum usa a pasta padrão', async () => {
        const claude = await start(tmpDir(dirs), tmpDir(dirs));
        expect(claude.profiles.map(usage => usage.active)).toEqual([true, false]);
        expect(claude.active?.profile.id).toBe('p0');
    });

    it('o perfil da pasta padrão é o ativo', async () => {
        const other = tmpDir(dirs);
        const main = tmpDir(dirs);
        const previous = GLib.getenv('CLAUDE_CONFIG_DIR');
        GLib.setenv('CLAUDE_CONFIG_DIR', `${main}/`, true);
        try {
            const claude = await start(other, main);
            expect(claude.profiles.map(usage => usage.active)).toEqual([false, true]);
            expect(claude.active?.profile.id).toBe('p1');
        } finally {
            if (previous === null) GLib.unsetenv('CLAUDE_CONFIG_DIR');
            else GLib.setenv('CLAUDE_CONFIG_DIR', previous, true);
        }
    });

    it('refaz a lista quando os perfis mudam', async () => {
        const first = tmpDir(dirs);
        const second = tmpDir(dirs);
        signIn(second, 'b');
        answer('b', ok());
        const claude = await start(first);
        settings.claudeProfiles = [{id: 'n', label: 'N', configDir: second}];
        await waitFor(claude, () => claude.active?.profile.id === 'n' && claude.active.status === 'ok');
        expect(claude.profiles.length).toBe(1);
    });
});
