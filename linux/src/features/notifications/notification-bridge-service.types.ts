import type Gio from 'gi://Gio';

export interface InterceptedNotification {
    readonly gicon: Gio.Icon | null;
    readonly app: string;
    readonly title: string;
    readonly body: string;
}

export interface NotificationBridgeEvents {
    changed: [];
    intercepted: [InterceptedNotification];
}
