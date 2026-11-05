import type Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import {Workspaces} from './workspaces-service.js';
import {WM_PREFERENCES_SCHEMA, WORKSPACE_NAMES_KEY} from './workspaces-service.const.js';
import {shellSettings} from '../../../tests/fixtures.js';
import {FakeSignals} from '../../../tests/shell/fake-signals.js';
import {layoutManager} from '../../../tests/shell/main.js';
import {prefs} from '../../../tests/shell/Meta.js';
import {appsByWindow, fakeApp} from '../../../tests/shell/Shell.js';

class FakeWindow {
    constructor(
        readonly rect: {x: number; y: number; width: number; height: number},
        readonly stack: number,
        readonly flags: {skipTaskbar?: boolean; allWorkspaces?: boolean; wmClass?: string} = {},
    ) {}

    get_frame_rect(): {x: number; y: number; width: number; height: number} {
        return this.rect;
    }

    is_skip_taskbar(): boolean {
        return this.flags.skipTaskbar ?? false;
    }

    is_on_all_workspaces(): boolean {
        return this.flags.allWorkspaces ?? false;
    }

    get_wm_class(): string | null {
        return this.flags.wmClass ?? null;
    }
}

class FakeWorkspace extends FakeSignals {
    readonly activations: number[] = [];

    constructor(readonly windows: FakeWindow[] = []) {
        super();
    }

    list_windows(): FakeWindow[] {
        return [...this.windows];
    }

    activate(time: number): void {
        this.activations.push(time);
    }
}

class FakeManager extends FakeSignals {
    readonly workspaces: FakeWorkspace[] = [];
    readonly appended: [boolean, number][] = [];
    active = 0;

    get n_workspaces(): number {
        return this.workspaces.length;
    }

    get_active_workspace_index(): number {
        return this.active;
    }

    get_workspace_by_index(index: number): FakeWorkspace | null {
        return this.workspaces[index] ?? null;
    }

    append_new_workspace(activate: boolean, time: number): void {
        this.appended.push([activate, time]);
    }
}

const NOW = 4242;

describe('Workspaces', () => {
    const scope = globalThis as unknown as {global?: unknown};
    let manager: FakeManager;
    let preferences: Gio.Settings;
    let workspaces: Workspaces | null = null;

    function create(): Workspaces {
        workspaces = new Workspaces(preferences);
        return workspaces;
    }

    beforeEach(() => {
        manager = new FakeManager();
        preferences = shellSettings(WM_PREFERENCES_SCHEMA);
        prefs.dynamicWorkspaces = true;
        layoutManager.workArea = {x: 0, y: 0, width: 1000, height: 500};
        scope.global = {
            workspace_manager: manager,
            display: {sort_windows_by_stacking: (windows: FakeWindow[]) => windows.toSorted((a, b) => a.stack - b.stack)},
            get_current_time: () => NOW,
        };
    });

    afterEach(() => {
        workspaces?.destroy();
        workspaces = null;
        appsByWindow.clear();
        delete scope.global;
    });

    it('descreve cada área com título, apps do topo para baixo, ativa e janelas em miniatura', () => {
        const editor = new FakeWindow({x: 0, y: 0, width: 500, height: 250}, 1);
        const browser = new FakeWindow({x: 500, y: 250, width: 500, height: 250}, 2);
        const panel = new FakeWindow({x: 0, y: 0, width: 1000, height: 30}, 3, {skipTaskbar: true});
        const terminal = new FakeWindow({x: 0, y: 0, width: 1000, height: 500}, 1, {wmClass: 'xterm'});
        appsByWindow.set(editor, fakeApp('Editor'));
        appsByWindow.set(browser, fakeApp('Navegador'));
        manager.workspaces.push(new FakeWorkspace([browser, panel, editor]), new FakeWorkspace([terminal]), new FakeWorkspace());
        manager.active = 1;
        preferences.set_strv(WORKSPACE_NAMES_KEY, ['', 'Terminal']);
        const infos = create().snapshot(100, 50);
        expect(infos.map(info => [info.index, info.title, info.apps, info.active])).toEqual([
            [0, 'Navegador', 'Navegador, Editor', false],
            [1, 'Terminal', 'Vazia', true],
            [2, 'Área 3', 'Vazia', false],
        ]);
        expect(infos[0]?.windows.map(window => window.rect)).toEqual([
            {x: 0, y: 0, width: 50, height: 25},
            {x: 50, y: 25, width: 50, height: 25},
        ]);
        expect(infos[1]?.windows.length).toBe(1);
        expect(infos[2]?.windows).toEqual([]);
    });

    it('avisa quando muda a área ativa, a ordem ou os nomes', () => {
        manager.workspaces.push(new FakeWorkspace());
        const service = create();
        const changed = jasmine.createSpy('changed');
        service.on('changed', changed);
        manager.emit('active-workspace-changed');
        manager.emit('workspaces-reordered');
        preferences.set_strv(WORKSPACE_NAMES_KEY, ['Mail']);
        expect(changed).toHaveBeenCalledTimes(3);
    });

    it('passa a ouvir as janelas da área criada e solta a removida', () => {
        const first = new FakeWorkspace();
        manager.workspaces.push(first);
        const service = create();
        const changed = jasmine.createSpy('changed');
        service.on('changed', changed);
        const second = new FakeWorkspace();
        manager.workspaces.push(second);
        manager.emit('workspace-added', 1);
        expect(second.connections()).toBe(2);
        second.emit('window-added');
        manager.workspaces.shift();
        manager.emit('workspace-removed', 0);
        expect(first.connections()).toBe(0);
        expect(second.connections()).toBe(2);
        expect(changed).toHaveBeenCalledTimes(3);
    });

    it('ativa a área pedida com o horário do shell', () => {
        const target = new FakeWorkspace();
        manager.workspaces.push(new FakeWorkspace(), target);
        const service = create();
        service.activate(1);
        service.activate(7);
        expect(target.activations).toEqual([NOW]);
    });

    it('com áreas dinâmicas reaproveita a última área vazia em vez de criar outra', () => {
        const sticky = new FakeWindow({x: 0, y: 0, width: 10, height: 10}, 1, {allWorkspaces: true});
        const last = new FakeWorkspace([sticky]);
        manager.workspaces.push(new FakeWorkspace(), last);
        create().add();
        expect(last.activations).toEqual([NOW]);
        expect(manager.appended).toEqual([]);
    });

    it('cria área nova quando a última tem janela ou as áreas são fixas', () => {
        const window = new FakeWindow({x: 0, y: 0, width: 10, height: 10}, 1);
        manager.workspaces.push(new FakeWorkspace([window]));
        const service = create();
        service.add();
        manager.workspaces[0]?.windows.pop();
        prefs.dynamicWorkspaces = false;
        service.add();
        expect(manager.appended).toEqual([
            [true, NOW],
            [true, NOW],
        ]);
    });

    it('ao ser destruído solta o gerenciador, as áreas e a chave de nomes', () => {
        const workspace = new FakeWorkspace();
        manager.workspaces.push(workspace);
        const connect = spyOn(preferences, 'connect').and.callThrough();
        const service = create();
        const namesId = connect.calls.mostRecent().returnValue;
        service.destroy();
        workspaces = null;
        expect(manager.connections()).toBe(0);
        expect(workspace.connections()).toBe(0);
        expect(GObject.signal_handler_is_connected(preferences, namesId)).toBeFalse();
    });
});
