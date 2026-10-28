import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import {needsRefresh, parseCredentials} from './claude-credentials.js';
import {readTextFile} from '../../shared/files.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
export const PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile';
export const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
export const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

const BETA_HEADER = 'oauth-2025-04-20';
const API_VERSION = '2023-06-01';
const DEFAULT_EXPIRES_IN = 8 * 3600;

export interface HttpRequest {
    readonly method: 'GET' | 'POST';
    readonly url: string;
    readonly token?: string;
    readonly json?: unknown;
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

export function credentialsPath(configDir: string): string {
    return GLib.build_filenamev([configDir, '.credentials.json']);
}

export function defaultConfigDir(): string {
    return GLib.getenv('CLAUDE_CONFIG_DIR') ?? GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
}

export function soupTransport(session: Soup.Session, cancellable: Gio.Cancellable): Transport {
    return async ({method, url, token, json}) => {
        const message = Soup.Message.new(method, url);
        const headers = message.get_request_headers();
        headers.append('anthropic-beta', BETA_HEADER);
        headers.append('anthropic-version', API_VERSION);
        headers.append('Accept', 'application/json');
        if (token) headers.append('Authorization', `Bearer ${token}`);
        if (json !== undefined)
            message.set_request_body_from_bytes('application/json', new GLib.Bytes(new TextEncoder().encode(JSON.stringify(json))));
        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
        return {status: message.get_status(), body: new TextDecoder().decode(bytes.toArray())};
    };
}

async function writePrivateFile(path: string, contents: string): Promise<void> {
    const file = Gio.File.new_for_path(path);
    await file.replace_contents_bytes_async(
        new GLib.Bytes(new TextEncoder().encode(contents)),
        null,
        false,
        Gio.FileCreateFlags.PRIVATE,
        null,
    );
}

function parseJson(body: string): unknown {
    return body === '' ? {} : JSON.parse(body);
}

export class ClaudeClient {
    readonly #configDir: string;
    readonly #transport: Transport;
    #tokenPromise: Promise<string> | null = null;

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
        const token = await this.#validToken();
        const response = await this.#transport({method: 'GET', url, token});
        if (response.status < 200 || response.status >= 300) throw new ClaudeApiError(response.status, response.body);
        return parseJson(response.body);
    }

    #validToken(): Promise<string> {
        this.#tokenPromise ??= this.#resolveToken().finally(() => {
            this.#tokenPromise = null;
        });
        return this.#tokenPromise;
    }

    async #resolveToken(): Promise<string> {
        const path = credentialsPath(this.#configDir);
        const raw = await readTextFile(path);
        const credentials = parseCredentials(raw);
        if (!raw || !credentials) throw new SignedOutError();
        if (!needsRefresh(credentials.expiresAt, Date.now())) return credentials.accessToken;
        if (!credentials.refreshToken) throw new ClaudeApiError(401, '');
        return this.#refresh(path, raw, credentials.refreshToken);
    }

    async #refresh(path: string, raw: string, refreshToken: string): Promise<string> {
        const response = await this.#transport({
            method: 'POST',
            url: TOKEN_URL,
            json: {grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID},
        });
        if (response.status === 400 || response.status === 401) throw new ClaudeApiError(401, response.body);
        if (response.status < 200 || response.status >= 300) throw new ClaudeApiError(response.status, response.body);

        const data = parseJson(response.body) as {access_token?: unknown; refresh_token?: unknown; expires_in?: unknown};
        if (typeof data.access_token !== 'string') throw new ClaudeApiError(502, response.body);

        const root = JSON.parse(raw) as {claudeAiOauth: Record<string, unknown>};
        root.claudeAiOauth.accessToken = data.access_token;
        if (typeof data.refresh_token === 'string') root.claudeAiOauth.refreshToken = data.refresh_token;
        const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : DEFAULT_EXPIRES_IN;
        root.claudeAiOauth.expiresAt = Date.now() + expiresIn * 1000;
        await writePrivateFile(path, JSON.stringify(root, null, 2));
        return data.access_token;
    }
}
