export interface FakeApp {
    get_name(): string;
    get_id(): string;
    get_icon(): object | null;
}

export const appsByPid = new Map<number, FakeApp>();
export const appsByWindow = new Map<object, FakeApp>();

export function fakeApp(name: string, id = `${name.toLowerCase()}.desktop`): FakeApp {
    const icon = {name};
    return {get_name: () => name, get_id: () => id, get_icon: () => icon};
}

const tracker = {
    get_app_from_pid: (pid: number): FakeApp | null => appsByPid.get(pid) ?? null,
    get_window_app: (window: object): FakeApp | null => appsByWindow.get(window) ?? null,
};

export default {
    WindowTracker: {get_default: (): typeof tracker => tracker},
};
