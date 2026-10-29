import type Gio from 'gi://Gio';

import {
    AI_PROVIDERS,
    CARD_IDS,
    CLOSED_ITEMS,
    CLOSED_MODES,
    MONITOR_MODES,
    PILL_POSITIONS,
    PILL_AI_ACTIVITIES,
    SURFACE_STYLES,
    TAB_IDS,
    isOneOf,
} from './schema-values.js';
import type {
    AiProvider,
    CardId,
    ClosedItem,
    ClosedMode,
    MonitorMode,
    PillAiActivity,
    PillPosition,
    SurfaceStyle,
    TabId,
} from './schema-values.js';
import {parseProfiles} from './claude-profile.js';
import {orderedTabs} from './tabs.js';
import type {ClaudeProfile} from './claude-profile.js';
import type {Disposer} from '../shared/disposables.js';

export type SettingsKey =
    | 'closed-mode'
    | 'closed-items'
    | 'rotate-seconds'
    | 'pill-position'
    | 'monitors'
    | 'hide-top-bar'
    | 'surface-style'
    | 'claude-poll-minutes'
    | 'claude-show-remaining'
    | 'claude-profiles'
    | 'claude-profiles-initialized'
    | 'claude-shortcut'
    | 'toggle-shortcut'
    | 'open-on-hover'
    | 'auto-close'
    | 'always-show-pill'
    | 'ram-percent'
    | 'pill-ai-activity'
    | 'hidden-tabs'
    | 'collapsed-cards'
    | 'disabled-ai'
    | 'gemini-daily-limit'
    | 'meeting-notice-minutes'
    | 'tab-order'
    | 'peek-clock'
    | 'peek-every-minutes'
    | 'peek-seconds';

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

    set rotateSeconds(value: number) {
        this.gsettings.set_int('rotate-seconds', value);
    }

    get pillPosition(): PillPosition {
        const value = this.gsettings.get_string('pill-position');
        return isOneOf(PILL_POSITIONS, value) ? value : 'center';
    }

    set pillPosition(value: PillPosition) {
        this.gsettings.set_string('pill-position', value);
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

    set hideTopBar(value: boolean) {
        this.gsettings.set_boolean('hide-top-bar', value);
    }

    get surfaceStyle(): SurfaceStyle {
        const value = this.gsettings.get_string('surface-style');
        return isOneOf(SURFACE_STYLES, value) ? value : 'solid';
    }

    set surfaceStyle(value: SurfaceStyle) {
        this.gsettings.set_string('surface-style', value);
    }

    get claudePollMinutes(): number {
        return this.gsettings.get_int('claude-poll-minutes');
    }

    set claudePollMinutes(value: number) {
        this.gsettings.set_int('claude-poll-minutes', value);
    }

    get claudeShowRemaining(): boolean {
        return this.gsettings.get_boolean('claude-show-remaining');
    }

    set claudeShowRemaining(value: boolean) {
        this.gsettings.set_boolean('claude-show-remaining', value);
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

    set toggleShortcut(value: string) {
        this.gsettings.set_strv('toggle-shortcut', [value]);
    }

    get claudeShortcut(): string {
        return this.gsettings.get_strv('claude-shortcut')[0] ?? '';
    }

    set claudeShortcut(value: string) {
        this.gsettings.set_strv('claude-shortcut', [value]);
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

    get alwaysShowPill(): boolean {
        return this.gsettings.get_boolean('always-show-pill');
    }

    set alwaysShowPill(value: boolean) {
        this.gsettings.set_boolean('always-show-pill', value);
    }

    get pillAiActivity(): PillAiActivity {
        const value = this.gsettings.get_string('pill-ai-activity');
        return isOneOf(PILL_AI_ACTIVITIES, value) ? value : 'change';
    }

    set pillAiActivity(value: PillAiActivity) {
        this.gsettings.set_string('pill-ai-activity', value);
    }

    get ramPercent(): boolean {
        return this.gsettings.get_boolean('ram-percent');
    }

    set ramPercent(value: boolean) {
        this.gsettings.set_boolean('ram-percent', value);
    }

    get hiddenTabs(): TabId[] {
        return known(TAB_IDS, this.gsettings.get_strv('hidden-tabs'));
    }

    set hiddenTabs(tabs: readonly TabId[]) {
        this.gsettings.set_strv('hidden-tabs', [...new Set(tabs)]);
    }

    get tabOrder(): TabId[] {
        return orderedTabs(this.gsettings.get_strv('tab-order'));
    }

    set tabOrder(tabs: readonly TabId[]) {
        this.gsettings.set_strv('tab-order', orderedTabs(tabs));
    }

    get collapsedCards(): CardId[] {
        return known(CARD_IDS, this.gsettings.get_strv('collapsed-cards'));
    }

    set collapsedCards(cards: readonly CardId[]) {
        this.gsettings.set_strv('collapsed-cards', [...new Set(cards)]);
    }

    get enabledProviders(): AiProvider[] {
        const disabled = this.gsettings.get_strv('disabled-ai');
        return AI_PROVIDERS.filter(provider => !disabled.includes(provider));
    }

    providerEnabled(provider: AiProvider): boolean {
        return this.enabledProviders.includes(provider);
    }

    setProviderEnabled(provider: AiProvider, enabled: boolean): void {
        const enabledNow = this.enabledProviders.filter(other => other !== provider);
        if (enabled) enabledNow.push(provider);
        this.gsettings.set_strv(
            'disabled-ai',
            AI_PROVIDERS.filter(other => !enabledNow.includes(other)),
        );
    }

    get geminiDailyLimit(): number {
        return this.gsettings.get_int('gemini-daily-limit');
    }

    set geminiDailyLimit(value: number) {
        this.gsettings.set_int('gemini-daily-limit', value);
    }

    get meetingNoticeMinutes(): number {
        return this.gsettings.get_int('meeting-notice-minutes');
    }

    set meetingNoticeMinutes(value: number) {
        this.gsettings.set_int('meeting-notice-minutes', value);
    }

    get peekClock(): boolean {
        return this.gsettings.get_boolean('peek-clock');
    }

    set peekClock(value: boolean) {
        this.gsettings.set_boolean('peek-clock', value);
    }

    get peekEveryMinutes(): number {
        return this.gsettings.get_int('peek-every-minutes');
    }

    set peekEveryMinutes(value: number) {
        this.gsettings.set_int('peek-every-minutes', value);
    }

    get peekSeconds(): number {
        return this.gsettings.get_int('peek-seconds');
    }

    set peekSeconds(value: number) {
        this.gsettings.set_int('peek-seconds', value);
    }

    onChanged(keys: SettingsKey | readonly SettingsKey[], callback: () => void): Disposer {
        const ids = (typeof keys === 'string' ? [keys] : keys).map(key => this.gsettings.connect(`changed::${key}`, callback));
        return () => {
            for (const id of ids) this.gsettings.disconnect(id);
        };
    }
}
