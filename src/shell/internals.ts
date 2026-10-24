import type Clutter from 'gi://Clutter';
import type Meta from 'gi://Meta';
import type St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type {Disposer} from '../util/disposables.js';

const APP_INDICATOR_PREFIX = 'appindicator-';

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
    readonly box: St.BoxLayout;
    readonly actor: St.Widget;
    readonly _grid: St.Widget;
    readonly _overlay: Clutter.Actor;
    readonly _activeMenu?: {close(animate: boolean): void} | null;
}

export interface QuickSettingsInternals {
    readonly menu: QuickSettingsMenuInternals;
    readonly _indicators: St.BoxLayout;
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
