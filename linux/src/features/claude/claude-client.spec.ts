import GLib from 'gi://GLib';

import {ClaudeApiError, ClaudeClient, ExpiredTokenError, SignedOutError, USAGE_URL} from './claude-client.js';
import type {HttpRequest, HttpResponse, Transport} from './claude-client.js';

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

    it('token vencido não chama a API nem grava as credenciais', async () => {
        writeCredentials({accessToken: 'velho', refreshToken: 'r1', expiresAt: NOW - 1000});
        const before = readCredentials();
        const client = new ClaudeClient(dir, transport({}));
        await expectAsync(client.fetchUsage()).toBeRejectedWithError(ExpiredTokenError);
        expect(calls).toEqual([]);
        expect(readCredentials()).toEqual(before);
    });

    it('chamadas em paralelo com token vencido não fazem requisição', async () => {
        writeCredentials({accessToken: 'velho', refreshToken: 'r1', expiresAt: NOW - 1000});
        const client = new ClaudeClient(dir, transport({}));
        const results = await Promise.allSettled([client.fetchUsage(), client.fetchProfile()]);
        expect(results.every(result => result.status === 'rejected' && result.reason instanceof ExpiredTokenError)).toBeTrue();
        expect(calls).toEqual([]);
    });

    it('usa o token novo quando o Claude Code renova o arquivo', async () => {
        writeCredentials({accessToken: 'velho', expiresAt: NOW - 1000});
        const client = new ClaudeClient(dir, transport({[`GET ${USAGE_URL}`]: {status: 200, body: '{}'}}));
        await expectAsync(client.fetchUsage()).toBeRejectedWithError(ExpiredTokenError);
        writeCredentials({accessToken: 'novo', expiresAt: NOW + 3600e3});
        await client.fetchUsage();
        expect(calls).toEqual([{method: 'GET', url: USAGE_URL, token: 'novo'}]);
    });

    it('credencial sem expiresAt usa o token', async () => {
        writeCredentials({accessToken: 'sem-prazo'});
        const client = new ClaudeClient(dir, transport({[`GET ${USAGE_URL}`]: {status: 200, body: '{}'}}));
        await client.fetchUsage();
        expect(calls).toEqual([{method: 'GET', url: USAGE_URL, token: 'sem-prazo'}]);
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
