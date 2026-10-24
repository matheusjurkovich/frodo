import GLib from 'gi://GLib';

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
