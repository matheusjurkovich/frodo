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
import type {EdgeSpan} from './geometry.types.js';
import type {Disposer} from './disposables.types.js';
import {Timer} from './timer.js';
import {
    NATIVE_INDICATORS,
    PANEL_SIDES,
    SYSTEM_INDICATOR_FIELDS,
    OWN_INDICATOR_FIELDS,
    WEEK,
    MONTH_HEADER,
    EDGE_PRESSURE,
    EDGE_TIMEOUT_MS,
} from './shell-internals.const.js';
import type {
    PanelInternals,
    PanelSide,
    QuickSettingsInternals,
    SystemIndicatorName,
    QuickSettingsParts,
    QuickSettingsIndicator,
    QuickSliderButtons,
    QuickSliderInternals,
    QuickToggleMenuHeader,
    QuickToggleMenuInternals,
    QuickMenuToggleInternals,
    InputSliderInternals,
    DateMenuInternals,
    CalendarParts,
    CalendarInternals,
    PressureBarrierClass,
    CalendarEventSource,
    PowerActions,
    MessageTrayInternals,
    SessionModeInternals,
} from './shell-internals.types.js';

export function patchMethod<Target extends object, Name extends keyof Target & string>(
    target: Target,
    name: Name,
    wrap: (original: Target[Name]) => Target[Name],
): Disposer {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    const original = (target[name] as (...args: never[]) => unknown).bind(target) as Target[Name];
    target[name] = wrap(original);
    return () => {
        if (descriptor) Object.defineProperty(target, name, descriptor);
        else Reflect.deleteProperty(target, name);
    };
}

function panelInternals(): PanelInternals {
    return Main.panel as unknown as PanelInternals;
}

export function panelBox(side: PanelSide): St.BoxLayout {
    const panel = panelInternals();
    return {left: panel._leftBox, center: panel._centerBox, right: panel._rightBox}[side];
}

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
    const {menu} = quick;
    if (menu._overlay.get_parent() !== menu.actor) return null;
    return {
        overlay: menu._overlay,
        isNative: (item): item is Clutter.Actor => item?.get_parent() === menu._grid,
        closeActiveMenu: () => {
            menu._activeMenu?.close(PopupAnimation.NONE);
        },
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
    return patchMethod(panelInternals(), 'closeQuickSettings', original => () => {
        original();
        onClose();
    });
}

export function keepMicrophoneSliderVisible(): Disposer {
    const slider = quickSettings()?._volumeInput?.quickSettingsItems[0] as InputSliderInternals | undefined;
    if (!slider) return () => undefined;
    const restore = patchMethod(slider, '_maybeShowInput', () => () => {
        slider._showInput = true;
        slider._sync();
    });
    slider._maybeShowInput();
    return () => {
        restore();
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

    calendar._headerFormat = MONTH_HEADER;
    calendar._headerFormatWithoutYear = MONTH_HEADER;
    header.set_child_above_sibling(back, title);
    title.x_align = Clutter.ActorAlign.START;
    const titleId = title.connect('notify::text', () => {
        const text = title.text.charAt(0).toLocaleUpperCase() + title.text.slice(1);
        if (text !== title.text) title.text = text;
    });
    const restore = patchMethod(calendar, '_rebuildCalendar', rebuild => () => {
        rebuild();
        trimMonth(calendar);
    });
    calendar._rebuildCalendar();
    calendar._update();

    return () => {
        restore();
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

export function powerActions(): PowerActions {
    return SystemActions.getDefault() as PowerActions;
}

export function spawn(argv: readonly string[]): void {
    (Util as unknown as {spawn(argv: string[]): void}).spawn([...argv]);
}

export function messageTray(): MessageTray.MessageTray & MessageTrayInternals {
    return Main.messageTray as MessageTray.MessageTray & MessageTrayInternals;
}

export function interceptBanners(
    shouldIntercept: (notification: MessageTray.Notification) => boolean,
    onIntercept: (notification: MessageTray.Notification) => void,
): Disposer {
    const tray = messageTray();
    const refresh = new Timer();
    const restore = patchMethod(tray, '_showNotification', original => () => {
        const next = tray._notificationQueue[0];
        if (!next || !shouldIntercept(next)) {
            original();
            return;
        }
        tray._notificationQueue.shift();
        tray.emit('queue-changed');
        onIntercept(next);
        refresh.once(0, () => {
            tray._updateState();
        });
    });
    return () => {
        refresh.destroy();
        restore();
    };
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
