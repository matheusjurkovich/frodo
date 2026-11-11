import type Clutter from 'gi://Clutter';
import type Meta from 'gi://Meta';
import type Shell from 'gi://Shell';
import type St from 'gi://St';
import type * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import type {PopupAnimation} from 'resource:///org/gnome/shell/ui/boxpointer.js';
import type * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import type {QuickSlider, QuickToggleMenu} from 'resource:///org/gnome/shell/ui/quickSettings.js';

export type PanelSide = 'left' | 'center' | 'right';

export interface PanelInternals {
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

export interface InputSliderInternals extends QuickSlider {
    _showInput: boolean;
    _sync(): void;
    _maybeShowInput(): void;
}

export interface QuickSliderInternals {
    readonly _iconButton: St.Button;
    readonly _menuButton: St.Button;
}

export interface QuickMenuToggleInternals {
    readonly _menuButton?: St.Button;
}

export interface QuickToggleMenuInternals {
    readonly _header: St.Widget;
    readonly _headerIcon: St.Icon;
}

export interface QuickToggleMenuHeader {
    readonly header: St.Widget;
    readonly icon: St.Icon;
}

export interface PressureBarrier {
    addBarrier(barrier: Meta.Barrier): void;
    connect(signal: 'trigger', callback: () => void): number;
    destroy(): void;
}

export type PressureBarrierClass = new (threshold: number, timeout: number, actionMode: Shell.ActionMode) => PressureBarrier;

export interface QuickSliderButtons {
    readonly icon: St.Button;
    readonly menu: St.Button;
}

export interface QuickSettingsIndicator<Item extends Clutter.Actor = Clutter.Actor> {
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
    readonly overlay: Clutter.Actor;
    readonly isNative: (item: Clutter.Actor | null) => item is Clutter.Actor;
    readonly closeActiveMenu: () => void;
    readonly tiles: readonly Clutter.Actor[];
    readonly output: QuickSlider | null;
    readonly input: QuickSlider | null;
    readonly brightness: QuickSlider | null;
}

export interface DateSetter {
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

export interface CalendarInternals {
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

export interface DateMenuInternals {
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

export type SystemIndicatorName = 'bluetooth' | 'volume' | 'microphone' | 'do-not-disturb' | 'battery';

export type PowerActions = ReturnType<typeof SystemActions.getDefault> & {
    activateSuspend(): void;
    activateRestart(): void;
    activateLogout(): void;
    activatePowerOff(): void;
    activateLockScreen(): void;
};

export interface SessionModeInternals {
    readonly isLocked: boolean;
    connect(signal: 'updated', callback: () => void): number;
    disconnect(id: number): void;
}
