import {FakeSignals} from './fake-signals.js';
import {FakeMessageTray} from './messageTray.js';

export class FakePanelBox {
    visible = true;

    hide(): void {
        this.visible = false;
    }

    show(): void {
        this.visible = true;
    }
}

export class FakeLayoutManager {
    readonly panelBox = new FakePanelBox();
    readonly chrome = new Map<object, object>();
    primaryIndex = 0;
    workArea = {x: 0, y: 0, width: 1000, height: 500};

    trackChrome(actor: object, params: object): void {
        this.chrome.set(actor, params);
    }

    untrackChrome(actor: object): void {
        this.chrome.delete(actor);
    }

    getWorkAreaForMonitor(index: number): {x: number; y: number; width: number; height: number} {
        if (index !== this.primaryIndex) throw new Error(`monitor ${index} inesperado`);
        return this.workArea;
    }
}

export class FakeScreenshotUi extends FakeSignals {
    screencast_in_progress = false;
    stops = 0;
    stopResult: Promise<void> = Promise.resolve();

    stopScreencast(): Promise<void> {
        this.stops++;
        return this.stopResult;
    }
}

export const layoutManager = new FakeLayoutManager();
export const screenshotUI = new FakeScreenshotUi();
export const messageTray = new FakeMessageTray();
export const panel: {statusArea: {dateMenu?: {_eventSource: object | null}}} = {statusArea: {}};
export const notifications: [string, string][] = [];

export function notify(title: string, body: string): void {
    notifications.push([title, body]);
}
