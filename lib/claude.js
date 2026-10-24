import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function toWin(percent, resetsAt) {
    const n = Number(percent);
    if (percent === null || percent === undefined || !Number.isFinite(n))
        return null;
    return {percent: n, resetsAt: resetsAt ?? null};
}

export function parseUsage(json) {
    const out = {session: null, weekly: null};
    if (!json || typeof json !== 'object')
        return out;
    if (Array.isArray(json.limits) && json.limits.length) {
        for (const l of json.limits) {
            if (!l)
                continue;
            const win = toWin(l.percent, l.resets_at);
            if (!win)
                continue;
            if (!out.session && (l.kind === 'session' || l.group === 'session'))
                out.session = win;
            else if (!out.weekly && (l.kind === 'weekly_all' || (l.group === 'weekly' && !l.scope)))
                out.weekly = win;
        }
        return out;
    }
    out.session = toWin(json.five_hour?.utilization, json.five_hour?.resets_at);
    out.weekly = toWin(json.seven_day?.utilization, json.seven_day?.resets_at);
    return out;
}

export function readToken(text, nowMs) {
    let root;
    try {
        root = JSON.parse(text);
    } catch {
        return {token: null, error: 'no-credentials'};
    }
    const oauth = root?.claudeAiOauth;
    if (!oauth?.accessToken)
        return {token: null, error: 'no-credentials'};
    const expiresAt = Number(oauth.expiresAt) || 0;
    if (expiresAt && expiresAt <= nowMs)
        return {token: null, error: 'expired'};
    return {token: oauth.accessToken, error: null};
}

export function errorForStatus(status) {
    if (status >= 200 && status < 300)
        return null;
    if (status === 401 || status === 403)
        return 'expired';
    return 'http';
}

export function formatReset(iso, nowMs) {
    if (!iso)
        return '';
    const at = new Date(iso);
    const diffMin = Math.max(0, Math.round((at.getTime() - nowMs) / 60e3));
    if (Number.isNaN(diffMin))
        return '';
    if (diffMin < 60)
        return `em ${diffMin}m`;
    if (diffMin < 24 * 60)
        return `em ${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
    const pad = n => String(n).padStart(2, '0');
    return `${WEEKDAYS[at.getDay()]} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function credentialsPath() {
    const dir = GLib.getenv('CLAUDE_CONFIG_DIR') || GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
    return GLib.build_filenamev([dir, '.credentials.json']);
}

async function loadCredentials() {
    try {
        const [bytes] = await Gio.File.new_for_path(credentialsPath()).load_contents_async(null);
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

export class ClaudeUsage {
    constructor() {
        this._session = new Soup.Session({timeout: 15});
        this._cancellable = new Gio.Cancellable();
    }

    async fetch() {
        const {token, error} = readToken(await loadCredentials(), Date.now());
        if (error)
            return {session: null, weekly: null, error};
        const msg = Soup.Message.new('GET', USAGE_URL);
        msg.request_headers.append('Authorization', `Bearer ${token}`);
        msg.request_headers.append('anthropic-beta', 'oauth-2025-04-20');
        msg.request_headers.append('anthropic-version', '2023-06-01');
        let bytes;
        try {
            bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, this._cancellable);
        } catch {
            return {session: null, weekly: null, error: 'network'};
        }
        const statusError = errorForStatus(msg.get_status());
        if (statusError)
            return {session: null, weekly: null, error: statusError};
        let json;
        try {
            json = JSON.parse(new TextDecoder().decode(bytes.toArray()));
        } catch {
            return {session: null, weekly: null, error: 'http'};
        }
        const usage = parseUsage(json);
        if (!usage.session && !usage.weekly)
            return {...usage, error: 'http'};
        return {...usage, error: null};
    }

    destroy() {
        this._cancellable.cancel();
        this._session.abort();
    }
}
