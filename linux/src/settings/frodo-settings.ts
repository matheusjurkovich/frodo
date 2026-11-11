import type Gio from 'gi://Gio';
import {AI_PROVIDERS, isOneOf, type AiProvider} from './schema-values.js';
import {
    CARD_IDS,
    CLOSED_ITEMS,
    CLOSED_MODES,
    MONITOR_MODES,
    PILL_POSITIONS,
    PILL_AI_ACTIVITIES,
    SURFACE_STYLES,
    TAB_IDS,
} from './schema-values.const.js';
import type {TabId} from './schema-values.types.js';
import {parseProfiles} from './claude-profile.js';
import type {ClaudeProfile} from './claude-profile.types.js';
import {orderedTabs} from './tabs.js';
import type {Disposer} from '../shared/disposables.types.js';
import type {Accessor, SettingsKey, SettingsValues} from './frodo-settings.types.js';

const known = <T extends string>(values: readonly T[], list: readonly string[]): T[] =>
    [...new Set(list)].filter((item): item is T => isOneOf(values, item));

const accessor = <K extends string, V>(
    key: K,
    read: (settings: Gio.Settings) => V,
    write: (settings: Gio.Settings, value: V) => void,
): Accessor<K, V> => ({key, read, write});

const bool = <K extends string>(key: K): Accessor<K, boolean> =>
    accessor(
        key,
        settings => settings.get_boolean(key),
        (settings, value) => {
            settings.set_boolean(key, value);
        },
    );

const int = <K extends string>(key: K): Accessor<K, number> =>
    accessor(
        key,
        settings => settings.get_int(key),
        (settings, value) => {
            settings.set_int(key, value);
        },
    );

const choice = <K extends string, T extends string>(key: K, values: readonly T[], fallback: T): Accessor<K, T> =>
    accessor(
        key,
        settings => {
            const value = settings.get_string(key);
            return isOneOf(values, value) ? value : fallback;
        },
        (settings, value) => {
            settings.set_string(key, value);
        },
    );

const subset = <K extends string, T extends string>(key: K, values: readonly T[]): Accessor<K, T[]> =>
    accessor(
        key,
        settings => known(values, settings.get_strv(key)),
        (settings, value) => {
            settings.set_strv(key, [...new Set(value)]);
        },
    );

const shortcut = <K extends string>(key: K): Accessor<K, string> =>
    accessor(
        key,
        settings => settings.get_strv(key)[0] ?? '',
        (settings, value) => {
            settings.set_strv(key, [value]);
        },
    );

export const accessors = {
    closedMode: choice('closed-mode', CLOSED_MODES, 'compact'),
    closedItems: subset('closed-items', CLOSED_ITEMS),
    rotateSeconds: int('rotate-seconds'),
    pillPosition: choice('pill-position', PILL_POSITIONS, 'center'),
    monitors: choice('monitors', MONITOR_MODES, 'primary'),
    hideTopBar: bool('hide-top-bar'),
    surfaceStyle: choice('surface-style', SURFACE_STYLES, 'solid'),
    claudePollMinutes: int('claude-poll-minutes'),
    claudeShowRemaining: bool('claude-show-remaining'),
    claudeProfiles: accessor<'claude-profiles', ClaudeProfile[]>(
        'claude-profiles',
        settings => parseProfiles(settings.get_string('claude-profiles')),
        (settings, profiles) => {
            settings.set_string('claude-profiles', JSON.stringify(profiles));
        },
    ),
    claudeProfilesInitialized: bool('claude-profiles-initialized'),
    toggleShortcut: shortcut('toggle-shortcut'),
    claudeShortcut: shortcut('claude-shortcut'),
    openOnHover: bool('open-on-hover'),
    autoClose: bool('auto-close'),
    alwaysShowPill: bool('always-show-pill'),
    pillAiActivity: choice('pill-ai-activity', PILL_AI_ACTIVITIES, 'change'),
    notifyDone: bool('notify-done'),
    notifyQuota: bool('notify-quota'),
    ramPercent: bool('ram-percent'),
    hiddenTabs: subset('hidden-tabs', TAB_IDS),
    tabOrder: accessor<'tab-order', TabId[]>(
        'tab-order',
        settings => orderedTabs(settings.get_strv('tab-order')),
        (settings, tabs) => {
            settings.set_strv('tab-order', orderedTabs(tabs));
        },
    ),
    collapsedCards: subset('collapsed-cards', CARD_IDS),
    enabledProviders: accessor<'disabled-ai', AiProvider[]>(
        'disabled-ai',
        settings => {
            const disabled = settings.get_strv('disabled-ai');
            return AI_PROVIDERS.filter(provider => !disabled.includes(provider));
        },
        (settings, enabled) => {
            settings.set_strv(
                'disabled-ai',
                AI_PROVIDERS.filter(provider => !enabled.includes(provider)),
            );
        },
    ),
    geminiDailyLimit: int('gemini-daily-limit'),
    meetingNoticeMinutes: int('meeting-notice-minutes'),
    peekClock: bool('peek-clock'),
    peekEveryMinutes: int('peek-every-minutes'),
    peekSeconds: int('peek-seconds'),
};

const SettingsBase = class {
    constructor(readonly gsettings: Gio.Settings) {}
} as new (gsettings: Gio.Settings) => {readonly gsettings: Gio.Settings} & SettingsValues;

for (const [name, entry] of Object.entries(accessors) as [string, Accessor<string, unknown>][]) {
    Object.defineProperty(SettingsBase.prototype, name, {
        get(this: {readonly gsettings: Gio.Settings}): unknown {
            return entry.read(this.gsettings);
        },
        set(this: {readonly gsettings: Gio.Settings}, value: unknown) {
            entry.write(this.gsettings, value);
        },
        enumerable: true,
        configurable: true,
    });
}

export class FrodoSettings extends SettingsBase {
    providerEnabled(provider: AiProvider): boolean {
        return this.enabledProviders.includes(provider);
    }

    setProviderEnabled(provider: AiProvider, enabled: boolean): void {
        this.enabledProviders = enabled
            ? [...this.enabledProviders.filter(other => other !== provider), provider]
            : this.enabledProviders.filter(other => other !== provider);
    }

    onChanged(keys: SettingsKey | readonly SettingsKey[], callback: () => void): Disposer {
        const ids = (typeof keys === 'string' ? [keys] : keys).map(key => this.gsettings.connect(`changed::${key}`, callback));
        return () => {
            for (const id of ids) this.gsettings.disconnect(id);
        };
    }
}
