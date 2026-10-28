import type Clutter from 'gi://Clutter';
import type Meta from 'gi://Meta';
import type St from 'gi://St';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {PopupAnimation} from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {QuickSlider, QuickToggleMenu} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import type {Disposer} from '../util/disposables.js';

const APP_INDICATOR_PREFIX = 'appindicator-';
const STATUS_MENU_ROLES = ['screenRecording', 'screenSharing', 'dwellClick', 'a11y', 'keyboard'] as const;

interface PanelInternals {
    readonly _centerBox: St.BoxLayout;
    closeQuickSettings(): void;
}

interface SessionModeInternals {
    readonly panel: Record<string, readonly string[]>;
}

interface StatusItem {
    readonly container?: Clutter.Actor;
    readonly menu?: PopupMenu.PopupMenu | null;
}

export interface QuickSettingsMenuInternals {
    readonly actor: St.Widget;
    readonly _grid: St.Widget;
    readonly _overlay: Clutter.Actor;
    readonly _activeMenu?: QuickToggleMenu | null;
    close(animate: PopupAnimation): void;
}

interface InputSliderInternals extends QuickSlider {
    _showInput: boolean;
    _sync(): void;
    _maybeShowInput(): void;
}

interface QuickSettingsIndicator<Item extends Clutter.Actor = Clutter.Actor> {
    readonly quickSettingsItems: readonly Item[];
}

export interface QuickSettingsInternals {
    readonly menu: QuickSettingsMenuInternals;
    readonly _indicators: St.BoxLayout;
    readonly _network?: {readonly _wirelessToggle: Clutter.Actor} | null;
    readonly _bluetooth?: QuickSettingsIndicator | null;
    readonly _rfkill?: QuickSettingsIndicator;
    readonly _powerProfiles?: QuickSettingsIndicator;
    readonly _doNotDisturb?: QuickSettingsIndicator;
    readonly _nightLight?: QuickSettingsIndicator;
    readonly _volumeOutput?: QuickSettingsIndicator<QuickSlider>;
    readonly _volumeInput?: QuickSettingsIndicator<QuickSlider>;
    readonly _brightness?: QuickSettingsIndicator<QuickSlider>;
}

export interface QuickSettingsParts {
    readonly menu: QuickSettingsMenuInternals;
    readonly tiles: readonly Clutter.Actor[];
    readonly output: QuickSlider | null;
    readonly input: QuickSlider | null;
    readonly brightness: QuickSlider | null;
}

interface DateSetter {
    setDate(date: Date): void;
}

export interface CalendarEvent {
    readonly summary: string;
    readonly date: Date;
    readonly end: Date;
}

export interface CalendarEventSource {
    getEvents(begin: Date, end: Date): readonly CalendarEvent[];
    connect(signal: 'changed', callback: () => void): number;
    disconnect(id: number): void;
}

interface DateMenuInternals {
    readonly _calendar: Clutter.Actor & DateSetter;
    readonly _date: DateSetter;
    readonly _eventsItem: Clutter.Actor & DateSetter;
    readonly _eventSource?: CalendarEventSource | null;
}

export interface CalendarParts {
    readonly month: Clutter.Actor;
    readonly events: Clutter.Actor;
    selectToday(): void;
}

export interface MessageTrayInternals {
    _notificationQueue: MessageTray.Notification[];
    _showNotification(): void;
    _updateState(): void;
    emit(signal: 'queue-changed'): void;
}

export interface AppIndicator {
    readonly container: Clutter.Actor;
    readonly menu: PopupMenu.PopupMenu | null;
}

function panelInternals(): PanelInternals {
    return Main.panel as unknown as PanelInternals;
}

export function panelCenterBox(): St.BoxLayout {
    return panelInternals()._centerBox;
}

export function sessionPanelHas(role: string): boolean {
    const {panel} = Main.sessionMode as SessionModeInternals;
    return Object.values(panel).some(roles => roles.includes(role));
}

export function dateMenuContainer(): Clutter.Actor | null {
    return Main.panel.statusArea.dateMenu?.container ?? null;
}

export function quickSettings(): QuickSettingsInternals | null {
    return (Main.panel.statusArea.quickSettings as unknown as QuickSettingsInternals | undefined) ?? null;
}

export function quickSettingsParts(): QuickSettingsParts | null {
    const quick = quickSettings();
    if (!quick) return null;
    const first = <Item extends Clutter.Actor>(indicator?: QuickSettingsIndicator<Item> | null): Item | null =>
        indicator?.quickSettingsItems[0] ?? null;
    const tiles = [
        quick._network?._wirelessToggle ?? null,
        first(quick._bluetooth),
        first(quick._rfkill),
        first(quick._powerProfiles),
        first(quick._doNotDisturb),
        first(quick._nightLight),
    ].filter(tile => tile !== null);
    return {
        menu: quick.menu,
        tiles,
        output: first(quick._volumeOutput),
        input: first(quick._volumeInput),
        brightness: first(quick._brightness),
    };
}

export function closeQuickSettingsMenu(): void {
    quickSettings()?.menu.close(PopupAnimation.NONE);
}

export function quickSettingsItemMenu(item: Clutter.Actor): QuickToggleMenu | null {
    return (item as {readonly menu?: QuickToggleMenu | null}).menu ?? null;
}

export function interceptCloseQuickSettings(onClose: () => void): Disposer {
    const panel = panelInternals();
    const descriptor = Object.getOwnPropertyDescriptor(panel, 'closeQuickSettings');
    const original = panel.closeQuickSettings.bind(panel);
    panel.closeQuickSettings = (): void => {
        original();
        onClose();
    };
    return () => {
        if (descriptor) Object.defineProperty(panel, 'closeQuickSettings', descriptor);
        else delete (panel as Partial<PanelInternals>).closeQuickSettings;
    };
}

export function panelStatusItems(): AppIndicator[] {
    const items: AppIndicator[] = [];
    const entries = Object.entries(Main.panel.statusArea);
    const wanted = [
        ...STATUS_MENU_ROLES.map(role => entries.find(([key]) => key === role)),
        ...entries.filter(([key]) => key.startsWith(APP_INDICATOR_PREFIX)),
    ];
    for (const entry of wanted) {
        const item = entry?.[1] as StatusItem | null | undefined;
        if (item?.container) items.push({container: item.container, menu: item.menu ?? null});
    }
    return items;
}

export function keepMicrophoneSliderVisible(): Disposer {
    const slider = quickSettings()?._volumeInput?.quickSettingsItems[0] as InputSliderInternals | undefined;
    if (!slider) return () => undefined;
    const descriptor = Object.getOwnPropertyDescriptor(slider, '_maybeShowInput');
    slider._maybeShowInput = (): void => {
        slider._showInput = true;
        slider._sync();
    };
    slider._maybeShowInput();
    return () => {
        if (descriptor) Object.defineProperty(slider, '_maybeShowInput', descriptor);
        else delete (slider as Partial<InputSliderInternals>)._maybeShowInput;
        slider._maybeShowInput();
    };
}

function dateMenuInternals(): DateMenuInternals | null {
    return (Main.panel.statusArea.dateMenu as unknown as DateMenuInternals | undefined) ?? null;
}

export function calendarParts(): CalendarParts | null {
    const dateMenu = dateMenuInternals();
    if (!dateMenu) return null;
    return {
        month: dateMenu._calendar,
        events: dateMenu._eventsItem,
        selectToday: () => {
            const now = new Date();
            dateMenu._calendar.setDate(now);
            dateMenu._date.setDate(now);
            dateMenu._eventsItem.setDate(now);
        },
    };
}

export function calendarEventSource(): CalendarEventSource | null {
    return dateMenuInternals()?._eventSource ?? null;
}

export type PowerActions = ReturnType<typeof SystemActions.getDefault> & {
    activateSuspend(): void;
    activateRestart(): void;
    activatePowerOff(): void;
    activateLockScreen(): void;
};

export function powerActions(): PowerActions {
    return SystemActions.getDefault() as PowerActions;
}

export function spawn(argv: readonly string[]): void {
    (Util as unknown as {spawn(argv: string[]): void}).spawn([...argv]);
}

export function messageTray(): MessageTray.MessageTray & MessageTrayInternals {
    return Main.messageTray as MessageTray.MessageTray & MessageTrayInternals;
}

function isVisibleOnActiveWorkspace(window: Meta.Window): boolean {
    const active = global.workspace_manager.get_active_workspace();
    return !window.minimized && (window.is_on_all_workspaces() || window.get_workspace() === active);
}

export function hasRealFullscreen(monitorIndex: number): boolean {
    return global
        .get_window_actors()
        .map(actor => actor.meta_window)
        .some(
            window =>
                window !== null && window.is_fullscreen() && window.get_monitor() === monitorIndex && isVisibleOnActiveWorkspace(window),
        );
}

export function onFullscreenStateChanged(callback: () => void): Disposer {
    const display = global.display;
    const workspaces = global.workspace_manager;
    const fullscreenId = display.connect('in-fullscreen-changed', callback);
    const workspaceId = workspaces.connect('active-workspace-changed', callback);
    return () => {
        display.disconnect(fullscreenId);
        workspaces.disconnect(workspaceId);
    };
}
