import type Clutter from 'gi://Clutter';
import type St from 'gi://St';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const APP_INDICATOR_PREFIX = 'appindicator-';

interface PanelInternals {
    readonly _centerBox: St.BoxLayout;
}

interface SessionModeInternals {
    readonly panel: Record<string, readonly string[]>;
}

interface StatusItem {
    readonly container?: Clutter.Actor;
    readonly menu?: PopupMenu.PopupMenu | null;
}

interface QuickToggle {
    readonly menu?: {open(): void} | null;
}

interface QuickSettingsInternals {
    readonly menu: {open(): void};
    readonly _network?: {readonly quickSettingsItems: readonly QuickToggle[]} | null;
    readonly _bluetooth?: {readonly quickSettingsItems: readonly QuickToggle[]} | null;
}

export interface MessageTrayInternals {
    _notificationQueue: MessageTray.Notification[];
    _showNotification(): void;
    _updateState(): void;
    emit(signal: 'queue-changed'): void;
}

export interface BrightnessScale {
    value: number;
    connect(signal: 'notify::value', callback: () => void): number;
    disconnect(id: number): void;
}

export interface BrightnessManager {
    readonly globalScale: BrightnessScale | null;
    connect(signal: 'changed', callback: () => void): number;
    disconnect(id: number): void;
}

export interface SystemActionsRuntime {
    activateLockScreen(): void;
    activateSuspend(): void;
    activateLogout(): void;
    activateRestart(): void;
    activatePowerOff(): void;
}

export interface AppIndicator {
    readonly container: Clutter.Actor;
    readonly menu: PopupMenu.PopupMenu | null;
}

export function panelCenterBox(): St.BoxLayout {
    return (Main.panel as unknown as PanelInternals)._centerBox;
}

export function sessionPanelHas(role: string): boolean {
    const {panel} = Main.sessionMode as SessionModeInternals;
    return Object.values(panel).some(roles => roles.includes(role));
}

export function dateMenuContainer(): Clutter.Actor | null {
    return Main.panel.statusArea.dateMenu?.container ?? null;
}

export function toggleDateMenu(): void {
    Main.panel.statusArea.dateMenu?.menu.toggle();
}

export function appIndicators(): AppIndicator[] {
    const indicators: AppIndicator[] = [];
    for (const [key, value] of Object.entries(Main.panel.statusArea)) {
        const item = value as StatusItem | null | undefined;
        if (!key.startsWith(APP_INDICATOR_PREFIX) || !item?.container) continue;
        indicators.push({container: item.container, menu: item.menu ?? null});
    }
    return indicators;
}

export function messageTray(): MessageTray.MessageTray & MessageTrayInternals {
    return Main.messageTray as MessageTray.MessageTray & MessageTrayInternals;
}

export function brightnessManager(): BrightnessManager {
    return (Main as unknown as {brightnessManager: BrightnessManager}).brightnessManager;
}

export function openQuickSettingsToggle(togglePattern: RegExp): boolean {
    const quickSettings = Main.panel.statusArea.quickSettings as unknown as QuickSettingsInternals | undefined;
    if (!quickSettings || !Main.layoutManager.panelBox.visible) return false;
    const toggles = [...(quickSettings._network?.quickSettingsItems ?? []), ...(quickSettings._bluetooth?.quickSettingsItems ?? [])];
    const toggle = toggles.find(item => togglePattern.test((item.constructor as {$gtype?: {name: string}}).$gtype?.name ?? ''));
    if (!toggle?.menu) return false;
    quickSettings.menu.open();
    toggle.menu.open();
    return true;
}

export function systemActions(): SystemActionsRuntime {
    return SystemActions.getDefault() as unknown as SystemActionsRuntime;
}
