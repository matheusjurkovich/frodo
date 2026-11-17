import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Secret from 'gi://Secret';
import Soup from 'gi://Soup?version=3.0';
import {readTextFile} from '../../shared/files.js';
import type {GitHubAuthMode} from '../../settings/schema-values.types.js';
import {tokenFromHostsYaml} from './github.js';
import {GITHUB_GRAPHQL_URL} from './github.const.js';
import {GH_SECRET_ATTRIBUTES, POST_TIMEOUT_SECONDS, TOKEN_ATTRIBUTES, TOKEN_LABEL, TOKEN_SCHEMA_NAME} from './github-client.const.js';
import type {GitHubBackend, GitHubHttpResponse} from './github-client.types.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

function settle<T>(
    start: (callback: (source: null, result: Gio.AsyncResult) => void) => void,
    finish: (result: Gio.AsyncResult) => T,
): Promise<T> {
    return new Promise((resolve, reject) => {
        start((_source, result) => {
            try {
                resolve(finish(result));
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    });
}

export class GitHubClient implements GitHubBackend {
    readonly #session = new Soup.Session({timeout: POST_TIMEOUT_SECONDS, user_agent: 'frodo'});
    readonly #cancellable = new Gio.Cancellable();
    readonly #schema = Secret.Schema.new(TOKEN_SCHEMA_NAME, Secret.SchemaFlags.NONE, {kind: Secret.SchemaAttributeType.STRING});

    async token(mode: GitHubAuthMode): Promise<string | null> {
        if (mode === 'token')
            return settle(callback => {
                Secret.password_lookup(this.#schema, TOKEN_ATTRIBUTES, this.#cancellable, callback);
            }, Secret.password_lookup_finish);
        const stored = await settle(callback => {
            Secret.password_lookup(null, GH_SECRET_ATTRIBUTES, this.#cancellable, callback);
        }, Secret.password_lookup_finish).catch(() => null);
        if (stored) return stored.trim();
        const configDir = GLib.getenv('GH_CONFIG_DIR') ?? GLib.build_filenamev([GLib.get_user_config_dir(), 'gh']);
        const hosts = await readTextFile(GLib.build_filenamev([configDir, 'hosts.yml']));
        return hosts === null ? null : tokenFromHostsYaml(hosts);
    }

    async storeToken(token: string): Promise<void> {
        await settle(callback => {
            Secret.password_store(
                this.#schema,
                TOKEN_ATTRIBUTES,
                Secret.COLLECTION_DEFAULT,
                TOKEN_LABEL,
                token.trim(),
                this.#cancellable,
                callback,
            );
        }, Secret.password_store_finish);
    }

    async clearToken(): Promise<void> {
        await settle(callback => {
            Secret.password_clear(this.#schema, TOKEN_ATTRIBUTES, this.#cancellable, callback);
        }, Secret.password_clear_finish);
    }

    async post(token: string, body: string): Promise<GitHubHttpResponse> {
        const message = Soup.Message.new('POST', GLib.getenv('FRODO_GITHUB_GRAPHQL_URL') ?? GITHUB_GRAPHQL_URL);
        const headers = message.get_request_headers();
        headers.append('Authorization', `Bearer ${token}`);
        headers.append('Accept', 'application/json');
        message.set_request_body_from_bytes('application/json', new GLib.Bytes(new TextEncoder().encode(body)));
        const bytes = await this.#session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, this.#cancellable);
        return {status: message.get_status(), body: new TextDecoder().decode(bytes.toArray())};
    }

    destroy(): void {
        this.#cancellable.cancel();
        this.#session.abort();
    }
}
