import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import {needsRefresh, parseCredentials} from './claude-credentials.js';
import {readTextFile} from '../../shared/files.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
export const PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile';

const BETA_HEADER = 'oauth-2025-04-20';
const API_VERSION = '2023-06-01';

export interface HttpRequest {
    readonly method: 'GET';
    readonly url: string;
    readonly token: string;
}

export interface HttpResponse {
    readonly status: number;
    readonly body: string;
}

export type Transport = (request: HttpRequest) => Promise<HttpResponse>;

export interface Tier {
    readonly subscriptionType: string | null;
    readonly rateLimitTier: string | null;
}

export class ClaudeApiError extends Error {
    readonly status: number;
    readonly apiMessage: string | null;

    constructor(status: number, body: string) {
        super(`Claude respondeu HTTP ${status}`);
        this.name = 'ClaudeApiError';
        this.status = status;
        this.apiMessage = ClaudeApiError.#messageFrom(body);
    }

    static #messageFrom(body: string): string | null {
        try {
            const parsed = JSON.parse(body) as {error?: {message?: unknown}} | null;
            return typeof parsed?.error?.message === 'string' ? parsed.error.message : null;
        } catch {
            return null;
        }
    }
}

export class SignedOutError extends Error {
    constructor() {
        super('Sem login do Claude Code neste perfil');
        this.name = 'SignedOutError';
    }
}

export class ExpiredTokenError extends Error {
    constructor() {
        super('Token do Claude Code vencido');
        this.name = 'ExpiredTokenError';
    }
}

export function credentialsPath(configDir: string): string {
    return GLib.build_filenamev([configDir, '.credentials.json']);
}

export function defaultConfigDir(): string {
    return GLib.getenv('CLAUDE_CONFIG_DIR') ?? GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
}

export function soupTransport(session: Soup.Session, cancellable: Gio.Cancellable): Transport {
    return async ({method, url, token}) => {
        const message = Soup.Message.new(method, url);
        const headers = message.get_request_headers();
        headers.append('anthropic-beta', BETA_HEADER);
        headers.append('anthropic-version', API_VERSION);
        headers.append('Accept', 'application/json');
        headers.append('Authorization', `Bearer ${token}`);
        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
        return {status: message.get_status(), body: new TextDecoder().decode(bytes.toArray())};
    };
}

function parseJson(body: string): unknown {
    return body === '' ? {} : JSON.parse(body);
}

export class ClaudeClient {
    readonly #configDir: string;
    readonly #transport: Transport;

    constructor(configDir: string, transport: Transport) {
        this.#configDir = configDir;
        this.#transport = transport;
    }

    fetchUsage(): Promise<unknown> {
        return this.#get(USAGE_URL);
    }

    fetchProfile(): Promise<unknown> {
        return this.#get(PROFILE_URL);
    }

    async readTier(): Promise<Tier> {
        const credentials = parseCredentials(await readTextFile(credentialsPath(this.#configDir)));
        return {subscriptionType: credentials?.subscriptionType ?? null, rateLimitTier: credentials?.rateLimitTier ?? null};
    }

    async #get(url: string): Promise<unknown> {
        const token = await this.#token();
        const response = await this.#transport({method: 'GET', url, token});
        if (response.status < 200 || response.status >= 300) throw new ClaudeApiError(response.status, response.body);
        return parseJson(response.body);
    }

    async #token(): Promise<string> {
        const credentials = parseCredentials(await readTextFile(credentialsPath(this.#configDir)));
        if (!credentials) throw new SignedOutError();
        if (needsRefresh(credentials.expiresAt, Date.now())) throw new ExpiredTokenError();
        return credentials.accessToken;
    }
}
