import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import type St from 'gi://St';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {PopupAnimation} from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import type {QuickSlider, QuickToggleMenu} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import type {EdgeSpan} from './geometry.js';
import type {Disposer} from './disposables.js';

const EDGE_PRESSURE = 100;
const EDGE_TIMEOUT_MS = 1000;

const NATIVE_INDICATORS: readonly string[] = [
    'activities',
    'quickSettings',
    'dateMenu',
    'a11y',
    'keyboard',
    'dwellClick',
    'screenRecording',
    'screenSharing',
];

export type PanelSide = 'left' | 'center' | 'right';

interface PanelInternals {
    readonly _leftBox: St.BoxLayout;
    readonly _centerBox: St.BoxLayout;
    readonly _rightBox: St.BoxLayout;
    closeQuickSettings(): void;
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

interface QuickSliderInternals {
    readonly _iconButton: St.Button;
    readonly _menuButton: St.Button;
}

interface QuickMenuToggleInternals {
    readonly _menuButton?: St.Button;
}

interface QuickToggleMenuInternals {
    readonly _header: St.Widget;
    readonly _headerIcon: St.Icon;
}

export interface QuickToggleMenuHeader {
    readonly header: St.Widget;
    readonly icon: St.Icon;
}

interface PressureBarrier {
    addBarrier(barrier: Meta.Barrier): void;
    connect(signal: 'trigger', callback: () => void): number;
    destroy(): void;
}

type PressureBarrierClass = new (threshold: number, timeout: number, actionMode: Shell.ActionMode) => PressureBarrier;

export interface QuickSliderButtons {
    readonly icon: St.Button;
    readonly menu: St.Button;
}

interface QuickSettingsIndicator<Item extends Clutter.Actor = Clutter.Actor> {
    readonly quickSettingsItems: readonly Item[];
}

export interface QuickSettingsInternals {
    readonly menu: QuickSettingsMenuInternals;
    readonly _indicators: St.BoxLayout;
    readonly _network?: (Clutter.Actor & {readonly _wirelessToggle: Clutter.Actor}) | null;
    readonly _bluetooth?: QuickSettingsIndicator | null;
    readonly _rfkill?: QuickSettingsIndicator;
    readonly _powerProfiles?: QuickSettingsIndicator;
    readonly _doNotDisturb?: QuickSettingsIndicator;
    readonly _nightLight?: QuickSettingsIndicator;
    readonly _darkMode?: QuickSettingsIndicator;
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

interface CalendarInternals {
    _headerFormat: string;
    _headerFormatWithoutYear: string;
    readonly _topBox: St.BoxLayout;
    readonly _monthLabel: St.Label;
    readonly _backButton: St.Button;
    readonly _buttons: readonly (St.Button & {readonly _date: Date})[];
    readonly _selectedDate: Date;
    _rebuildCalendar(): void;
    _update(): void;
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

function panelInternals(): PanelInternals {
    return Main.panel as unknown as PanelInternals;
}

export function panelBox(side: PanelSide): St.BoxLayout {
    const panel = panelInternals();
    return {left: panel._leftBox, center: panel._centerBox, right: panel._rightBox}[side];
}

const PANEL_SIDES: readonly PanelSide[] = ['left', 'center', 'right'];

export function extensionIndicators(): Clutter.Actor[] {
    const statusArea = Main.panel.statusArea as Record<string, {readonly container?: Clutter.Actor} | undefined>;
    const containers = Object.entries(statusArea)
        .filter(([role]) => !NATIVE_INDICATORS.includes(role))
        .map(([, indicator]) => indicator?.container);
    return PANEL_SIDES.flatMap(side =>
        panelBox(side)
            .get_children()
            .filter(child => containers.includes(child)),
    );
}

export function onIndicatorsChanged(callback: () => void): Disposer {
    const indicators = quickSettings()?._indicators;
    const boxes = [...PANEL_SIDES.map(panelBox), ...(indicators ? [indicators] : [])];
    const destroyed = new Set<Clutter.Actor>();
    const changed = (): void => {
        if (destroyed.size === 0) callback();
    };
    const ids = boxes.map(
        box =>
            [
                box,
                [
                    box.connect('child-added', changed),
                    box.connect('child-removed', changed),
                    box.connect('destroy', () => {
                        destroyed.add(box);
                    }),
                ],
            ] as const,
    );
    return () => {
        for (const [box, handlers] of ids) if (!destroyed.has(box)) for (const id of handlers) box.disconnect(id);
    };
}

export function quickSettings(): QuickSettingsInternals | null {
    return (Main.panel.statusArea.quickSettings as unknown as QuickSettingsInternals | undefined) ?? null;
}

export function networkIndicator(): Clutter.Actor | null {
    return quickSettings()?._network ?? null;
}

export type SystemIndicatorName = 'bluetooth' | 'volume' | 'microphone' | 'do-not-disturb' | 'battery';

const SYSTEM_INDICATOR_FIELDS: Record<SystemIndicatorName, string> = {
    bluetooth: '_bluetooth',
    volume: '_volumeOutput',
    microphone: '_volumeInput',
    'do-not-disturb': '_doNotDisturb',
    battery: '_system',
};

const OWN_INDICATOR_FIELDS: readonly string[] = [...Object.values(SYSTEM_INDICATOR_FIELDS), '_network'];

function quickSettingsFields(): Record<string, Clutter.Actor | null | undefined> | null {
    return quickSettings() as unknown as Record<string, Clutter.Actor | null | undefined> | null;
}

export function systemIndicator(name: SystemIndicatorName): Clutter.Actor | null {
    return quickSettingsFields()?.[SYSTEM_INDICATOR_FIELDS[name]] ?? null;
}

export function otherSystemIndicators(): Clutter.Actor[] {
    const fields = quickSettingsFields();
    const indicators = quickSettings()?._indicators;
    if (!fields || !indicators) return [];
    const own = OWN_INDICATOR_FIELDS.map(field => fields[field]);
    return indicators.get_children().filter(child => !own.includes(child));
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
        first(quick._darkMode),
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

export function closeDateMenu(): void {
    Main.panel.statusArea.dateMenu?.menu.close(PopupAnimation.NONE);
}

export function quickSettingsItemMenu(item: Clutter.Actor): QuickToggleMenu | null {
    return (item as {readonly menu?: QuickToggleMenu | null}).menu ?? null;
}

export function quickSliderButtons(slider: QuickSlider): QuickSliderButtons {
    const {_iconButton: icon, _menuButton: menu} = slider as unknown as QuickSliderInternals;
    return {icon, menu};
}

export function quickToggleMenuHeader(menu: QuickToggleMenu): QuickToggleMenuHeader {
    const {_header: header, _headerIcon: icon} = menu as unknown as QuickToggleMenuInternals;
    return {header, icon};
}

export function quickToggleMenuButton(tile: Clutter.Actor): St.Button | null {
    return (tile as QuickMenuToggleInternals)._menuButton ?? null;
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

const WEEK = 7;
const MONTH_HEADER = '%OB %Y';

function trimMonth(calendar: CalendarInternals): void {
    const month = calendar._selectedDate.getMonth();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    calendar._buttons.forEach((button, index, buttons) => {
        const date = button._date;
        button.label = String(date.getDate());
        if (date.getMonth() !== month) button.set({opacity: 0, reactive: false, can_focus: false});
        else if (date < today) button.add_style_class_name('frodo-past');
        if (index % WEEK === 0) {
            const outside = buttons.slice(index, index + WEEK).every(day => day._date.getMonth() !== month);
            for (const day of buttons.slice(index, index + WEEK)) day.visible = !outside;
        }
    });
}

export function styleCalendar(): Disposer {
    const calendar = dateMenuInternals()?._calendar as unknown as CalendarInternals | undefined;
    if (!calendar) return () => undefined;
    const {_topBox: header, _monthLabel: title, _backButton: back} = calendar;
    const {_headerFormat: withYear, _headerFormatWithoutYear: withoutYear} = calendar;
    const descriptor = Object.getOwnPropertyDescriptor(calendar, '_rebuildCalendar');
    const rebuild = calendar._rebuildCalendar.bind(calendar);

    calendar._headerFormat = MONTH_HEADER;
    calendar._headerFormatWithoutYear = MONTH_HEADER;
    header.set_child_above_sibling(back, title);
    title.x_align = Clutter.ActorAlign.START;
    const titleId = title.connect('notify::text', () => {
        const text = title.text.charAt(0).toLocaleUpperCase() + title.text.slice(1);
        if (text !== title.text) title.text = text;
    });
    calendar._rebuildCalendar = (): void => {
        rebuild();
        trimMonth(calendar);
    };
    calendar._rebuildCalendar();
    calendar._update();

    return () => {
        if (descriptor) Object.defineProperty(calendar, '_rebuildCalendar', descriptor);
        else delete (calendar as Partial<CalendarInternals>)._rebuildCalendar;
        calendar._headerFormat = withYear;
        calendar._headerFormatWithoutYear = withoutYear;
        if (calendar._monthLabel === title) {
            title.disconnect(titleId);
            title.x_align = Clutter.ActorAlign.CENTER;
            header.set_child_below_sibling(back, title);
        }
        calendar._rebuildCalendar();
        calendar._update();
    };
}

export function watchTopEdge(span: EdgeSpan, onPush: () => void): Disposer {
    const {PressureBarrier: Barrier} = Layout as unknown as {PressureBarrier: PressureBarrierClass};
    const barrier = new Meta.Barrier({
        backend: global.backend,
        x1: span.x1,
        y1: span.y,
        x2: span.x2,
        y2: span.y,
        directions: Meta.BarrierDirection.POSITIVE_Y,
    });
    const pressure = new Barrier(EDGE_PRESSURE, EDGE_TIMEOUT_MS, Shell.ActionMode.NORMAL);
    pressure.addBarrier(barrier);
    pressure.connect('trigger', () => {
        if (!global.stage.get_grab_actor()) onPush();
    });
    return () => {
        pressure.destroy();
        barrier.destroy();
    };
}

export function calendarEventSource(): CalendarEventSource | null {
    return dateMenuInternals()?._eventSource ?? null;
}

export type PowerActions = ReturnType<typeof SystemActions.getDefault> & {
    activateSuspend(): void;
    activateRestart(): void;
    activateLogout(): void;
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

interface SessionModeInternals {
    readonly isLocked: boolean;
    connect(signal: 'updated', callback: () => void): number;
    disconnect(id: number): void;
}

function sessionMode(): SessionModeInternals {
    return Main.sessionMode as SessionModeInternals;
}

export function isScreenLocked(): boolean {
    return sessionMode().isLocked;
}

export function onSessionModeChanged(callback: () => void): Disposer {
    const mode = sessionMode();
    const id = mode.connect('updated', callback);
    return () => {
        mode.disconnect(id);
    };
}

function isVisibleOnActiveWorkspace(window: Meta.Window): boolean {
    const active = global.workspace_manager.get_active_workspace();
    return !window.minimized && (window.is_on_all_workspaces() || window.get_workspace() === active);
}

export function hasRealFullscreen(monitorIndex: number): boolean {
    return visibleWindowsOn(monitorIndex).some(window => window.is_fullscreen());
}

export function hasMaximizedWindow(monitorIndex: number): boolean {
    return visibleWindowsOn(monitorIndex).some(
        window => window.maximized_vertically && window.get_window_type() === Meta.WindowType.NORMAL,
    );
}

function visibleWindowsOn(monitorIndex: number): Meta.Window[] {
    return global
        .get_window_actors()
        .map(actor => actor.meta_window)
        .filter(
            (window): window is Meta.Window =>
                window !== null && window.get_monitor() === monitorIndex && isVisibleOnActiveWorkspace(window),
        );
}

export function onWindowCoverChanged(callback: () => void): Disposer {
    const display = global.display;
    const workspaces = global.workspace_manager;
    const wm = global.window_manager;
    const displayIds = ['in-fullscreen-changed', 'restacked', 'window-entered-monitor'].map(signal => display.connect(signal, callback));
    const wmIds = ['size-changed', 'minimize', 'unminimize', 'map', 'destroy'].map(signal => wm.connect(signal, callback));
    const workspaceId = workspaces.connect('active-workspace-changed', callback);
    return () => {
        for (const id of displayIds) display.disconnect(id);
        for (const id of wmIds) wm.disconnect(id);
        workspaces.disconnect(workspaceId);
    };
}
