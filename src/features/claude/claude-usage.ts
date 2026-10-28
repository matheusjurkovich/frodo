export type Level = 'ok' | 'warn' | 'crit';
export type WindowRole = 'session' | 'weekly' | 'scoped' | 'other';
export type TierIcon = 'free' | 'pro' | 'max' | 'team' | 'enterprise';

export interface UsageWindow {
    readonly key: string;
    readonly label: string;
    readonly role: WindowRole;
    readonly utilization: number;
    readonly resetsAt: string | null;
    readonly totalSeconds: number | null;
    readonly apiLevel: Level;
    readonly isActive: boolean;
}

export interface Spend {
    readonly used: string | null;
    readonly limit: string | null;
    readonly percent: number | null;
    readonly level: Level;
}

export interface LevelInput {
    readonly utilization: number;
    readonly resetsAt: string | null;
    readonly totalSeconds: number | null;
    readonly apiLevel: Level;
}

type Json = Record<string, unknown>;

const FIVE_HOUR_SECONDS = 5 * 3600;
const SEVEN_DAY_SECONDS = 7 * 24 * 3600;
const GROUP_SECONDS: Record<string, number> = {session: FIVE_HOUR_SECONDS, weekly: SEVEN_DAY_SECONDS};
const ROLE_ORDER: Record<WindowRole, number> = {session: 0, weekly: 1, scoped: 2, other: 3};
const LEVEL_RANK: Record<Level, number> = {ok: 0, warn: 1, crit: 2};
const KNOWN_MODEL: Record<string, string> = {opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', oauth_apps: 'OAuth Apps'};
const TIER_ICONS: readonly TierIcon[] = ['free', 'pro', 'max', 'team', 'enterprise'];
const LOCKOUT_CRIT_FRACTION = 0.1;
const DISPLAY_WARN_UTILIZATION = 80;

function isJson(value: unknown): value is Json {
    return typeof value === 'object' && value !== null;
}

function field(value: unknown, ...path: string[]): unknown {
    let current = value;
    for (const key of path) current = isJson(current) ? current[key] : undefined;
    return current;
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

function finite(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function humanize(token: string): string {
    return token
        .split(/[_\s]+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function apiSeverityLevel(severity: unknown): Level {
    if (severity === 'critical') return 'crit';
    if (severity === 'warning') return 'warn';
    return 'ok';
}

export function modelLabel(name: string): string {
    return KNOWN_MODEL[name] ?? humanize(name);
}

function limitRole(entry: Json): WindowRole {
    const {kind, group} = entry;
    if (kind === 'session' || group === 'session') return 'session';
    if (kind === 'weekly_all') return 'weekly';
    if (kind === 'weekly_scoped') return 'scoped';
    if (group === 'weekly') return 'weekly';
    return 'other';
}

function limitLabel(entry: Json): string {
    const model = text(field(entry, 'scope', 'model', 'display_name'));
    const surface = text(field(entry, 'scope', 'surface'));
    let base: string;
    switch (entry.kind) {
        case 'session':
            base = '5 horas';
            break;
        case 'weekly_all':
            base = '7 dias';
            break;
        case 'weekly_scoped':
            base = model ? `7 dias ${model}` : '7 dias (por modelo)';
            break;
        default:
            base = humanize(text(entry.kind) ?? text(entry.group) ?? 'uso');
            if (model) base += ` ${model}`;
    }
    return surface ? `${base} · ${humanize(surface)}` : base;
}

function limitKey(entry: Json): string {
    const parts = ['limit', text(entry.kind) ?? '?', text(entry.group) ?? '?'];
    const model = text(field(entry, 'scope', 'model', 'display_name')) ?? text(field(entry, 'scope', 'model', 'id'));
    const surface = text(field(entry, 'scope', 'surface'));
    if (model) parts.push(model);
    if (surface) parts.push(surface);
    return parts.join(':');
}

function fromLimit(entry: Json, utilization: number): UsageWindow {
    const role = limitRole(entry);
    const group = text(entry.group);
    const fallback = role === 'session' ? FIVE_HOUR_SECONDS : role === 'other' ? null : SEVEN_DAY_SECONDS;
    return {
        key: limitKey(entry),
        label: limitLabel(entry),
        role,
        utilization,
        resetsAt: text(entry.resets_at),
        totalSeconds: (group ? GROUP_SECONDS[group] : undefined) ?? fallback,
        apiLevel: apiSeverityLevel(entry.severity),
        isActive: entry.is_active === true,
    };
}

function legacyWindow(key: string, label: string, role: WindowRole, window: unknown, totalSeconds: number): UsageWindow | null {
    const utilization = finite(field(window, 'utilization'));
    if (utilization === null) return null;
    return {
        key: `legacy:${key}`,
        label,
        role,
        utilization,
        resetsAt: text(field(window, 'resets_at')),
        totalSeconds,
        apiLevel: 'ok',
        isActive: false,
    };
}

export function normalizeWindows(usage: unknown): UsageWindow[] {
    if (!isJson(usage)) return [];
    const limits = usage.limits;
    if (Array.isArray(limits)) {
        const windows: UsageWindow[] = [];
        for (const entry of limits) {
            const utilization = isJson(entry) ? finite(entry.percent) : null;
            if (isJson(entry) && utilization !== null) windows.push(fromLimit(entry, utilization));
        }
        if (windows.length > 0) return windows.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
    }
    const windows = [
        legacyWindow('five_hour', '5 horas', 'session', usage.five_hour, FIVE_HOUR_SECONDS),
        legacyWindow('seven_day', '7 dias', 'weekly', usage.seven_day, SEVEN_DAY_SECONDS),
        ...Object.keys(usage)
            .map(key => [key, /^seven_day_(.+)$/.exec(key)?.[1]] as const)
            .filter((pair): pair is readonly [string, string] => pair[1] !== undefined)
            .map(([key, model]) => legacyWindow(key, `7 dias ${modelLabel(model)}`, 'scoped', usage[key], SEVEN_DAY_SECONDS)),
    ];
    return windows.filter((window): window is UsageWindow => window !== null);
}

function formatMinor(money: unknown): string | null {
    const amount = finite(field(money, 'amount_minor'));
    if (amount === null) return null;
    const exponent = finite(field(money, 'exponent')) ?? 2;
    const currency = text(field(money, 'currency'));
    return `${currency ? `${currency} ` : ''}${(amount / 10 ** exponent).toFixed(exponent)}`;
}

export function normalizeSpend(usage: unknown): Spend | null {
    const spend = field(usage, 'spend');
    if (field(spend, 'enabled') === true) {
        const used = formatMinor(field(spend, 'used'));
        const limit =
            formatMinor(field(spend, 'limit')) ?? formatMinor(field(spend, 'cap', 'money')) ?? formatMinor(field(spend, 'cap', 'credits'));
        if (used || limit)
            return {used, limit, percent: finite(field(spend, 'percent')), level: apiSeverityLevel(field(spend, 'severity'))};
    }

    const extra = field(usage, 'extra_usage');
    if (field(extra, 'is_enabled') !== true) return null;
    const places = finite(field(extra, 'decimal_places')) ?? 2;
    const currency = text(field(extra, 'currency'));
    const money = (value: number | null): string | null =>
        value === null ? null : `${currency ? `${currency} ` : ''}${(value / 10 ** places).toFixed(places)}`;
    const used = money(finite(field(extra, 'used_credits')));
    const monthlyLimit = finite(field(extra, 'monthly_limit'));
    const limit = monthlyLimit !== null && monthlyLimit > 0 ? money(monthlyLimit) : null;
    if (!used && !limit) return null;
    const utilization = finite(field(extra, 'utilization'));
    return {used: used ?? money(0), limit, percent: utilization === null ? null : Math.round(utilization), level: 'ok'};
}

function resetMs(resetsAt: string | null): number | null {
    const time = resetsAt ? Date.parse(resetsAt) : NaN;
    return Number.isNaN(time) ? null : time;
}

export function pacePercent(resetsAt: string | null, totalSeconds: number | null, now: number): number | null {
    const reset = resetMs(resetsAt);
    if (reset === null || !totalSeconds || totalSeconds <= 0) return null;
    const remaining = (reset - now) / 1000;
    if (remaining <= 0) return null;
    return Math.max(0, (1 - remaining / totalSeconds) * 100);
}

export function shownPercent(utilization: number, remaining: boolean): number {
    return remaining ? Math.max(0, 100 - Math.round(utilization)) : utilization;
}

export function shownPace(pace: number | null, remaining: boolean): number | null {
    return pace === null || !remaining ? pace : 100 - pace;
}

export function tierLabel(plan: string | null, rateLimitTier: string | null): string {
    const base =
        (plan ?? '')
            .replace(/^claude[_-]/i, '')
            .replace(/[_-]+/g, ' ')
            .trim()
            .toUpperCase() || 'CLAUDE';
    const multiplier = /(\d+)x/.exec(rateLimitTier ?? '')?.[1];
    return multiplier ? `${base} ${multiplier}x` : base;
}

export function tierIcon(label: string): TierIcon | null {
    const first = label.trim().toLowerCase().split(/\s+/)[0] ?? '';
    return TIER_ICONS.find(tier => tier === first) ?? null;
}

function utilizationLevel(utilization: number): Level {
    if (utilization >= 90) return 'crit';
    if (utilization >= 75) return 'warn';
    return 'ok';
}

function maxLevel(a: Level, b: Level): Level {
    return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

function elapsedSeconds({resetsAt, totalSeconds}: LevelInput, now: number): {elapsed: number; remaining: number; total: number} | null {
    const reset = resetMs(resetsAt);
    if (reset === null || !totalSeconds) return null;
    const remaining = (reset - now) / 1000;
    if (remaining <= 0) return null;
    const elapsed = totalSeconds - remaining;
    if (elapsed <= 0 || elapsed / totalSeconds < 0.05) return null;
    return {elapsed, remaining, total: totalSeconds};
}

function projectedUtilization(window: LevelInput, now: number): number {
    const span = elapsedSeconds(window, now);
    return span ? Math.max(window.utilization, (window.utilization * span.total) / span.elapsed) : window.utilization;
}

function exhaustSeconds(window: LevelInput, now: number): number | null {
    const span = elapsedSeconds(window, now);
    if (!span || window.utilization <= 0) return null;
    const toExhaust = (span.elapsed * (100 - window.utilization)) / window.utilization;
    return toExhaust > 0 && toExhaust < span.remaining ? toExhaust : null;
}

function lockoutSeconds(window: LevelInput, now: number): number | null {
    const exhaust = exhaustSeconds(window, now);
    const span = elapsedSeconds(window, now);
    return exhaust === null || !span ? null : Math.max(0, span.remaining - exhaust);
}

export function effectiveLevel(window: LevelInput, now: number): Level {
    let level = utilizationLevel(window.utilization);
    const lockout = lockoutSeconds(window, now);
    if (lockout !== null && window.totalSeconds) {
        level = maxLevel(level, lockout >= window.totalSeconds * LOCKOUT_CRIT_FRACTION ? 'crit' : 'warn');
    } else if (projectedUtilization(window, now) >= 75) {
        level = maxLevel(level, 'warn');
    }
    return maxLevel(level, window.apiLevel);
}

export function displayLevel(window: LevelInput, now: number): Level {
    if (effectiveLevel(window, now) === 'crit') return 'crit';
    return window.utilization >= DISPLAY_WARN_UTILIZATION || window.apiLevel === 'warn' ? 'warn' : 'ok';
}

export function humanDuration(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    if (total < 60) return `${total}s`;
    const minutes = Math.round(total / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function projectionNote(window: LevelInput, remaining: boolean, now: number): string {
    const lockout = lockoutSeconds(window, now);
    if (lockout !== null && window.totalSeconds) {
        if (lockout >= window.totalSeconds * LOCKOUT_CRIT_FRACTION)
            return `ritmo alto: acaba em ~${humanDuration(exhaustSeconds(window, now) ?? 0)}`;
        return 'no ritmo atual acaba pouco antes do reset';
    }
    const projected = projectedUtilization(window, now);
    if (projected < 75 || Math.round(projected) <= Math.round(window.utilization)) return '';
    return remaining
        ? `tendência de ~${shownPercent(projected, true)}% restante até o reset`
        : `tendência de ~${Math.round(projected)}% até o reset`;
}

export function relativeReset(resetsAt: string | null, now: number): string {
    const reset = resetMs(resetsAt);
    if (reset === null) return '';
    const seconds = (reset - now) / 1000;
    if (seconds <= 0) return 'reiniciando…';
    return `reinicia em ${humanDuration(seconds)}`;
}

export interface AccountSummary {
    readonly who: string | null;
    readonly plan: string | null;
    readonly rateLimitTier: string | null;
    readonly subtitle: string;
}

export function accountSummary(profile: unknown): AccountSummary | null {
    const account = field(profile, 'account');
    if (!isJson(account)) return null;
    const who = text(account.display_name) ?? text(account.full_name);
    const application = text(field(profile, 'application', 'name')) ?? 'Claude';
    const active = field(profile, 'organization', 'subscription_status') === 'active';
    const status = active ? `${application} · ativo` : application;
    const plan =
        text(field(profile, 'organization', 'organization_type')) ??
        (account.has_claude_max === true ? 'max' : account.has_claude_pro === true ? 'pro' : null);
    return {
        who,
        plan,
        rateLimitTier: text(field(profile, 'organization', 'rate_limit_tier')),
        subtitle: who ? `${who} · ${status}` : status,
    };
}

export function claudeErrorMessage(status: number | null, apiMessage: string | null): string {
    switch (status) {
        case null:
            return 'Não foi possível falar com o Claude.';
        case 401:
            return 'Sessão expirada. Entre de novo no Claude Code.';
        case 403:
            return apiMessage ?? 'Sem assinatura ativa do Claude nesta conta.';
        case 429:
            return 'Limite de requisições do Claude; tentando de novo em breve.';
        default:
            return `Erro do Claude (HTTP ${status}).`;
    }
}
