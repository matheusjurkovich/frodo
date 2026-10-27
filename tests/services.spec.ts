import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {CLIENT_ID, ClaudeApiError, ClaudeClient, PROFILE_URL, SignedOutError, TOKEN_URL, USAGE_URL} from '../src/services/claude-client.js';
import type {HttpRequest, HttpResponse, Transport} from '../src/services/claude-client.js';
import {readMemory} from '../src/services/memory.js';
import {FrodoSettings, SCHEMA_ID} from '../src/services/settings.js';

describe('readMemory', () => {
    it('lê /proc/meminfo', async () => {
        const memory = await readMemory();
        expect(memory).not.toBeNull();
        expect(memory?.usedKb).toBeGreaterThan(0);
        expect(memory?.usedKb).toBeLessThan(memory?.totalKb ?? 0);
    });
});

describe('ClaudeClient', () => {
    const NOW = Date.now();
    let dir: string;
    let calls: HttpRequest[];

    function writeCredentials(oauth: Record<string, unknown>): void {
        GLib.file_set_contents(`${dir}/.credentials.json`, JSON.stringify({claudeAiOauth: oauth, outro: {manter: true}}));
    }

    function readCredentials(): Record<string, unknown> {
        const [, bytes] = GLib.file_get_contents(`${dir}/.credentials.json`);
        return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    }

    function transport(responses: Record<string, HttpResponse>): Transport {
        return request => {
            calls.push(request);
            return Promise.resolve(responses[`${request.method} ${request.url}`] ?? {status: 404, body: ''});
        };
    }

    beforeEach(() => {
        dir = GLib.dir_make_tmp('frodo-claude-XXXXXX');
        calls = [];
    });

    afterEach(() => {
        GLib.unlink(`${dir}/.credentials.json`);
        GLib.rmdir(dir);
    });

    it('sem credenciais avisa que não há login', async () => {
        GLib.file_set_contents(`${dir}/.credentials.json`, '{}');
        const client = new ClaudeClient(dir, transport({}));
        await expectAsync(client.fetchUsage()).toBeRejectedWithError(SignedOutError);
        expect(calls).toEqual([]);
    });

    it('usa o token válido sem renovar', async () => {
        writeCredentials({accessToken: 'valido', refreshToken: 'r', expiresAt: NOW + 3600e3});
        const client = new ClaudeClient(dir, transport({[`GET ${USAGE_URL}`]: {status: 200, body: '{"five_hour":{"utilization":10}}'}}));
        expect(await client.fetchUsage()).toEqual({five_hour: {utilization: 10}});
        expect(calls).toEqual([{method: 'GET', url: USAGE_URL, token: 'valido'}]);
    });

    it('renova o token expirado e regrava o arquivo preservando o resto', async () => {
        writeCredentials({accessToken: 'velho', refreshToken: 'r1', expiresAt: NOW - 1000, subscriptionType: 'max'});
        const client = new ClaudeClient(
            dir,
            transport({
                [`POST ${TOKEN_URL}`]: {status: 200, body: '{"access_token":"novo","refresh_token":"r2","expires_in":3600}'},
                [`GET ${USAGE_URL}`]: {status: 200, body: '{}'},
            }),
        );
        await client.fetchUsage();
        expect(calls[0]).toEqual({
            method: 'POST',
            url: TOKEN_URL,
            json: {grant_type: 'refresh_token', refresh_token: 'r1', client_id: CLIENT_ID},
        });
        expect(calls[1]).toEqual({method: 'GET', url: USAGE_URL, token: 'novo'});
        const saved = readCredentials();
        const oauth = saved.claudeAiOauth as Record<string, unknown>;
        expect(oauth.accessToken).toBe('novo');
        expect(oauth.refreshToken).toBe('r2');
        expect(oauth.subscriptionType).toBe('max');
        expect(Number(oauth.expiresAt)).toBeGreaterThan(NOW);
        expect(saved.outro).toEqual({manter: true});
    });

    it('trata refresh recusado como sessão expirada', async () => {
        writeCredentials({accessToken: 'velho', refreshToken: 'r1', expiresAt: NOW - 1000});
        const client = new ClaudeClient(dir, transport({[`POST ${TOKEN_URL}`]: {status: 400, body: '{}'}}));
        await expectAsync(client.fetchUsage()).toBeRejectedWith(jasmine.objectContaining({status: 401}));
    });

    it('faz uma única renovação para chamadas em paralelo', async () => {
        writeCredentials({accessToken: 'velho', refreshToken: 'r1', expiresAt: NOW - 1000});
        const client = new ClaudeClient(
            dir,
            transport({
                [`POST ${TOKEN_URL}`]: {status: 200, body: '{"access_token":"novo","expires_in":3600}'},
                [`GET ${USAGE_URL}`]: {status: 200, body: '{}'},
                [`GET ${PROFILE_URL}`]: {status: 200, body: '{}'},
            }),
        );
        await Promise.all([client.fetchUsage(), client.fetchProfile()]);
        expect(calls.filter(call => call.method === 'POST').length).toBe(1);
    });

    it('expõe o status 429', async () => {
        writeCredentials({accessToken: 'valido', expiresAt: NOW + 3600e3});
        const client = new ClaudeClient(dir, transport({[`GET ${USAGE_URL}`]: {status: 429, body: ''}}));
        const error: unknown = await client.fetchUsage().catch((reason: unknown) => reason);
        expect(error instanceof ClaudeApiError && error.status).toBe(429);
    });

    it('lê o plano direto das credenciais', async () => {
        writeCredentials({accessToken: 'a', subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x'});
        const client = new ClaudeClient(dir, transport({}));
        expect(await client.readTier()).toEqual({subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x'});
    });
});

describe('FrodoSettings', () => {
    function create(): FrodoSettings {
        const source = Gio.SettingsSchemaSource.new_from_directory('.build', Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(SCHEMA_ID, false);
        if (!schema) throw new Error('schema não compilado em .build');
        return new FrodoSettings(new Gio.Settings({settings_schema: schema, backend: Gio.memory_settings_backend_new()}));
    }

    it('expõe os padrões tipados', () => {
        const settings = create();
        expect(settings.closedMode).toBe('compact');
        expect(settings.closedItems).toEqual(['clock', 'system', 'ram', 'claude-session']);
        expect(settings.monitors).toBe('primary');
        expect(settings.hideTopBar).toBeFalse();
        expect(settings.toggleShortcut).toBe('<Super>z');
    });

    it('ignora itens desconhecidos e repetidos e preserva a ordem escolhida', () => {
        const settings = create();
        settings.gsettings.set_strv('closed-items', ['claude-weekly', 'xyz', 'battery', 'battery']);
        expect(settings.closedItems).toEqual(['claude-weekly', 'battery']);
        settings.closedItems = ['ram', 'clock', 'ram'];
        expect(settings.gsettings.get_strv('closed-items')).toEqual(['ram', 'clock']);
    });

    it('avisa mudanças e permite parar de ouvir', () => {
        const settings = create();
        const spy = jasmine.createSpy('changed');
        const off = settings.onChanged(['closed-mode', 'monitors'], spy);
        settings.closedMode = 'minimal';
        off();
        settings.monitors = 'both';
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('lê e grava as chaves do redesign', () => {
        const settings = create();
        expect(settings.openOnHover).toBeTrue();
        expect(settings.autoClose).toBeFalse();
        expect(settings.hiddenTabs).toEqual([]);
        settings.gsettings.set_strv('hidden-tabs', ['claude', 'xyz', 'claude']);
        expect(settings.hiddenTabs).toEqual(['claude']);
        settings.collapsedCards = ['apps', 'apps'];
        expect(settings.gsettings.get_strv('collapsed-cards')).toEqual(['apps']);
    });

    it('grava expandir ao passar o mouse e recolher sozinha', () => {
        const settings = create();
        settings.openOnHover = false;
        settings.autoClose = true;
        expect(settings.gsettings.get_boolean('open-on-hover')).toBeFalse();
        expect(settings.gsettings.get_boolean('auto-close')).toBeTrue();
    });
});
