import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import {errorForStatus, parseUsage, readToken} from '../core/claude.js';
import type {ClaudeError, ClaudeUsage} from '../core/types.js';
import {readTextFile} from './memory.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const TIMEOUT_SECONDS = 15;

function failure(error: ClaudeError): ClaudeUsage {
    return {session: null, weekly: null, error};
}

export function credentialsPath(): string {
    const dir = GLib.getenv('CLAUDE_CONFIG_DIR') ?? GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
    return GLib.build_filenamev([dir, '.credentials.json']);
}

export class ClaudeClient {
    readonly #session = new Soup.Session({timeout: TIMEOUT_SECONDS});
    readonly #cancellable = new Gio.Cancellable();

    async fetch(): Promise<ClaudeUsage> {
        const credentials = readToken(await readTextFile(credentialsPath()), Date.now());
        if (credentials.error) return failure(credentials.error);

        const message = Soup.Message.new('GET', USAGE_URL);
        message.request_headers.append('Authorization', `Bearer ${credentials.token}`);
        message.request_headers.append('anthropic-beta', 'oauth-2025-04-20');
        message.request_headers.append('anthropic-version', '2023-06-01');

        let bytes: GLib.Bytes;
        try {
            bytes = await this.#session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, this.#cancellable);
        } catch {
            return failure('network');
        }

        const statusError = errorForStatus(message.get_status());
        if (statusError) return failure(statusError);

        let json: unknown;
        try {
            json = JSON.parse(new TextDecoder().decode(bytes.toArray()));
        } catch {
            return failure('http');
        }
        const usage = parseUsage(json);
        if (!usage.session && !usage.weekly) return failure('http');
        return {...usage, error: null};
    }

    destroy(): void {
        this.#cancellable.cancel();
        this.#session.abort();
    }
}
