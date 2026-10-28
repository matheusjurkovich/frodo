import type Gio from 'gi://Gio';

import {CARD_IDS, CLOSED_ITEMS, CLOSED_MODES, MONITOR_MODES, TAB_IDS, isOneOf} from './schema-values.js';
import type {CardId, ClosedItem, ClosedMode, MonitorMode, TabId} from './schema-values.js';
import {parseProfiles} from '../features/claude/claude-profiles.js';
import type {ClaudeProfile} from '../features/claude/claude-profiles.js';
import type {Disposer} from '../shared/disposables.js';

export type SettingsKey =
    | 'closed-mode'
    | 'closed-items'
    | 'rotate-seconds'
    | 'monitors'
    | 'hide-top-bar'
    | 'claude-poll-minutes'
    | 'claude-show-remaining'
    | 'claude-profiles'
    | 'claude-profiles-initialized'
    | 'claude-shortcut'
    | 'toggle-shortcut'
    | 'open-on-hover'
    | 'auto-close'
    | 'hidden-tabs'
    | 'collapsed-cards';

const known = <T extends string>(values: readonly T[], list: readonly string[]): T[] =>
    [...new Set(list)].filter((item): item is T => isOneOf(values, item));

export class FrodoSettings {
    constructor(readonly gsettings: Gio.Settings) {}

    get closedMode(): ClosedMode {
        const value = this.gsettings.get_string('closed-mode');
        return isOneOf(CLOSED_MODES, value) ? value : 'compact';
    }

    set closedMode(value: ClosedMode) {
        this.gsettings.set_string('closed-mode', value);
    }

    get closedItems(): ClosedItem[] {
        return known(CLOSED_ITEMS, this.gsettings.get_strv('closed-items'));
    }

    set closedItems(items: readonly ClosedItem[]) {
        this.gsettings.set_strv('closed-items', [...new Set(items)]);
    }

    get rotateSeconds(): number {
        return this.gsettings.get_int('rotate-seconds');
    }

    get monitors(): MonitorMode {
        const value = this.gsettings.get_string('monitors');
        return isOneOf(MONITOR_MODES, value) ? value : 'primary';
    }

    set monitors(value: MonitorMode) {
        this.gsettings.set_string('monitors', value);
    }

    get hideTopBar(): boolean {
        return this.gsettings.get_boolean('hide-top-bar');
    }

    get claudePollMinutes(): number {
        return this.gsettings.get_int('claude-poll-minutes');
    }

    get claudeShowRemaining(): boolean {
        return this.gsettings.get_boolean('claude-show-remaining');
    }

    get claudeProfiles(): ClaudeProfile[] {
        return parseProfiles(this.gsettings.get_string('claude-profiles'));
    }

    set claudeProfiles(profiles: readonly ClaudeProfile[]) {
        this.gsettings.set_string('claude-profiles', JSON.stringify(profiles));
    }

    get claudeProfilesInitialized(): boolean {
        return this.gsettings.get_boolean('claude-profiles-initialized');
    }

    set claudeProfilesInitialized(value: boolean) {
        this.gsettings.set_boolean('claude-profiles-initialized', value);
    }

    get toggleShortcut(): string {
        return this.gsettings.get_strv('toggle-shortcut')[0] ?? '';
    }

    get openOnHover(): boolean {
        return this.gsettings.get_boolean('open-on-hover');
    }

    set openOnHover(value: boolean) {
        this.gsettings.set_boolean('open-on-hover', value);
    }

    get autoClose(): boolean {
        return this.gsettings.get_boolean('auto-close');
    }

    set autoClose(value: boolean) {
        this.gsettings.set_boolean('auto-close', value);
    }

    get hiddenTabs(): TabId[] {
        return known(TAB_IDS, this.gsettings.get_strv('hidden-tabs'));
    }

    set hiddenTabs(tabs: readonly TabId[]) {
        this.gsettings.set_strv('hidden-tabs', [...new Set(tabs)]);
    }

    get collapsedCards(): CardId[] {
        return known(CARD_IDS, this.gsettings.get_strv('collapsed-cards'));
    }

    set collapsedCards(cards: readonly CardId[]) {
        this.gsettings.set_strv('collapsed-cards', [...new Set(cards)]);
    }

    onChanged(keys: SettingsKey | readonly SettingsKey[], callback: () => void): Disposer {
        const ids = (typeof keys === 'string' ? [keys] : keys).map(key => this.gsettings.connect(`changed::${key}`, callback));
        return () => {
            for (const id of ids) this.gsettings.disconnect(id);
        };
    }
}
