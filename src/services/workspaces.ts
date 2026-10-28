import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WINDOW_COLOR_SLOTS, appsSummary, colorSlot, thumbnailRects, workspaceTitle} from '../core/workspaces.js';
import type {Rect} from '../core/workspaces.js';
import {Emitter} from '../util/emitter.js';

const WM_PREFERENCES_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WORKSPACE_NAMES_KEY = 'workspace-names';

export interface WorkspaceWindow {
    readonly rect: Rect;
    readonly slot: number;
}

export interface WorkspaceInfo {
    readonly index: number;
    readonly title: string;
    readonly apps: string;
    readonly active: boolean;
    readonly windows: readonly WorkspaceWindow[];
}

export class Workspaces extends Emitter<{changed: []}> {
    readonly #manager = global.workspace_manager;
    readonly #tracker = Shell.WindowTracker.get_default();
    readonly #preferences = new Gio.Settings({schema_id: WM_PREFERENCES_SCHEMA});
    readonly #tracked = new Map<Meta.Workspace, number[]>();
    readonly #managerIds: number[];
    readonly #namesId: number;

    constructor() {
        super();
        const notify = (): void => {
            this.emit('changed');
        };
        const retrack = (): void => {
            this.#track();
            this.emit('changed');
        };
        this.#managerIds = [
            this.#manager.connect('workspace-added', retrack),
            this.#manager.connect('workspace-removed', retrack),
            this.#manager.connect('workspaces-reordered', notify),
            this.#manager.connect('active-workspace-changed', notify),
        ];
        this.#namesId = this.#preferences.connect(`changed::${WORKSPACE_NAMES_KEY}`, notify);
        this.#track();
    }

    snapshot(width: number, height: number): WorkspaceInfo[] {
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        const names = this.#preferences.get_strv(WORKSPACE_NAMES_KEY);
        const active = this.#manager.get_active_workspace_index();
        const infos: WorkspaceInfo[] = [];
        for (let index = 0; index < this.#manager.n_workspaces; index++) {
            const windows: WorkspaceWindow[] = [];
            const appNames: string[] = [];
            for (const window of this.#windows(index)) {
                const app = this.#tracker.get_window_app(window) as Shell.App | null;
                if (app) appNames.push(app.get_name());
                const [rect] = thumbnailRects([window.get_frame_rect()], area, width, height);
                if (rect) windows.push({rect, slot: colorSlot(app?.get_id() ?? window.get_wm_class() ?? '', WINDOW_COLOR_SLOTS)});
            }
            const topFirst = appNames.toReversed();
            infos.push({
                index,
                title: workspaceTitle(names[index], topFirst, index),
                apps: appsSummary(topFirst),
                active: index === active,
                windows,
            });
        }
        return infos;
    }

    activate(index: number): void {
        this.#manager.get_workspace_by_index(index)?.activate(global.get_current_time());
    }

    add(): void {
        const time = global.get_current_time();
        const last = this.#manager.get_workspace_by_index(this.#manager.n_workspaces - 1);
        if (Meta.prefs_get_dynamic_workspaces() && last && this.#isEmpty(last)) last.activate(time);
        else this.#manager.append_new_workspace(true, time);
    }

    #windows(index: number): Meta.Window[] {
        const workspace = this.#manager.get_workspace_by_index(index);
        const windows = workspace?.list_windows().filter(window => !window.is_skip_taskbar()) ?? [];
        return global.display.sort_windows_by_stacking(windows);
    }

    #isEmpty(workspace: Meta.Workspace): boolean {
        return workspace.list_windows().every(window => window.is_skip_taskbar() || window.is_on_all_workspaces());
    }

    #track(): void {
        const current = new Set<Meta.Workspace>();
        for (let index = 0; index < this.#manager.n_workspaces; index++) {
            const workspace = this.#manager.get_workspace_by_index(index);
            if (workspace) current.add(workspace);
        }
        for (const [workspace, ids] of this.#tracked) {
            if (current.has(workspace)) continue;
            for (const id of ids) workspace.disconnect(id);
            this.#tracked.delete(workspace);
        }
        const notify = (): void => {
            this.emit('changed');
        };
        for (const workspace of current) {
            if (this.#tracked.has(workspace)) continue;
            this.#tracked.set(workspace, [workspace.connect('window-added', notify), workspace.connect('window-removed', notify)]);
        }
    }

    destroy(): void {
        for (const id of this.#managerIds) this.#manager.disconnect(id);
        this.#preferences.disconnect(this.#namesId);
        for (const [workspace, ids] of this.#tracked) for (const id of ids) workspace.disconnect(id);
        this.#tracked.clear();
        this.clearListeners();
    }
}
