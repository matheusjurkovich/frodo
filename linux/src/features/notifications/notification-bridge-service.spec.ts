import type Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import {NotificationBridge, notificationIcon} from './notification-bridge-service.js';
import type {InterceptedNotification} from './notification-bridge-service.types.js';
import {MAX_ITEMS, NOTIFICATIONS_SCHEMA, SHOW_BANNERS_KEY} from './notification-bridge-service.const.js';
import {settle, shellSettings} from '../../../tests/fixtures.js';
import {messageTray} from '../../../tests/shell/main.js';
import {FakeNotification, FakeSource, NotificationDestroyedReason} from '../../../tests/shell/messageTray.js';

type NotificationArg = Parameters<typeof notificationIcon>[0];

describe('NotificationBridge', () => {
    let settings: Gio.Settings;
    let bridge: NotificationBridge | null = null;

    function create(): NotificationBridge {
        bridge = new NotificationBridge(settings);
        return bridge;
    }

    function queue(notification: FakeNotification): void {
        messageTray._notificationQueue.push(notification);
        messageTray._showNotification();
    }

    beforeEach(() => {
        settings = shellSettings(NOTIFICATIONS_SCHEMA);
        messageTray._notificationQueue = [];
        messageTray.shownByShell = [];
        messageTray.stateUpdates = 0;
    });

    afterEach(() => {
        bridge?.destroy();
        bridge = null;
        for (const source of messageTray.getSources()) messageTray.removeSource(source);
    });

    it('lista as notificações de todas as fontes, mais recentes primeiro e com limite', () => {
        const chat = new FakeSource('Chat');
        messageTray.addSource(chat);
        const service = create();
        const mail = new FakeSource('Mail');
        messageTray.addSource(mail);
        chat.add(new FakeNotification(chat, {title: 'velha', usec: 1}));
        mail.add(new FakeNotification(mail, {title: 'nova', usec: 3}));
        chat.add(new FakeNotification(chat, {title: 'meio', usec: 2}));
        expect(service.list().map(notification => notification.title)).toEqual(['nova', 'meio', 'velha']);
        expect(service.count).toBe(3);
        for (let index = 0; index < MAX_ITEMS; index++) chat.add(new FakeNotification(chat, {usec: 10 + index}));
        expect(service.list().length).toBe(MAX_ITEMS);
        expect(service.count).toBe(MAX_ITEMS + 3);
    });

    it('avisa quando fontes e notificações entram e saem e solta a fonte removida', () => {
        const service = create();
        const changed = jasmine.createSpy('changed');
        service.on('changed', changed);
        const chat = new FakeSource('Chat');
        messageTray.addSource(chat);
        const notification = new FakeNotification(chat);
        chat.add(notification);
        notification.destroy(NotificationDestroyedReason.EXPIRED);
        expect(changed).toHaveBeenCalledTimes(3);
        messageTray.removeSource(chat);
        expect(changed).toHaveBeenCalledTimes(4);
        expect(chat.connections()).toBe(0);
        expect(service.count).toBe(0);
    });

    it('dispensa uma notificação e limpa todas avisando uma vez só', () => {
        const chat = new FakeSource('Chat');
        messageTray.addSource(chat);
        const first = new FakeNotification(chat);
        const second = new FakeNotification(chat);
        chat.add(first);
        chat.add(second);
        const service = create();
        service.dismiss(first as unknown as NotificationArg);
        expect(first.destroyedWith).toBe(NotificationDestroyedReason.DISMISSED);
        const changed = jasmine.createSpy('changed');
        service.on('changed', changed);
        chat.add(new FakeNotification(chat));
        changed.calls.reset();
        service.clear();
        expect(service.count).toBe(0);
        expect(second.destroyedWith).toBe(NotificationDestroyedReason.DISMISSED);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('não perturbe inverte show-banners e avisa quando a chave muda', () => {
        const service = create();
        const changed = jasmine.createSpy('changed');
        service.on('changed', changed);
        expect(service.doNotDisturb).toBeFalse();
        service.doNotDisturb = true;
        expect(settings.get_boolean(SHOW_BANNERS_KEY)).toBeFalse();
        expect(service.doNotDisturb).toBeTrue();
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('troca o banner da notificação comum por um evento intercepted', async () => {
        const service = create();
        const intercepted: InterceptedNotification[] = [];
        service.on('intercepted', item => intercepted.push(item));
        const queueChanged = jasmine.createSpy('queue-changed');
        messageTray.connect('queue-changed', queueChanged);
        const icon = {name: 'chat'};
        const chat = new FakeSource('Chat', icon);
        const notification = new FakeNotification(chat, {title: 'Oi', body: 'tudo bem?', isTransient: true});
        chat.notifications.push(notification);
        queue(notification);
        expect(messageTray.shownByShell).toEqual([]);
        expect(messageTray._notificationQueue).toEqual([]);
        expect(queueChanged).toHaveBeenCalled();
        expect(notification.sounds).toBe(1);
        expect(notification.acknowledged).toBeTrue();
        expect(notification.destroyedWith).toBe(NotificationDestroyedReason.EXPIRED);
        expect(intercepted).toEqual([{gicon: icon as unknown as Gio.Icon, app: 'Chat', title: 'Oi', body: 'tudo bem?'}]);
        await settle();
        expect(messageTray.stateUpdates).toBe(1);
    });

    it('deixa a notificação crítica seguir para o banner do shell', () => {
        const service = create();
        const intercepted = jasmine.createSpy('intercepted');
        service.on('intercepted', intercepted);
        const critical = new FakeNotification(new FakeSource('Bateria'), {urgency: 3});
        queue(critical);
        expect(messageTray.shownByShell).toEqual([critical]);
        expect(intercepted).not.toHaveBeenCalled();
        expect(critical.destroyedWith).toBeNull();
    });

    it('mantém a notificação não transitória depois de interceptar', () => {
        create();
        const kept = new FakeNotification(new FakeSource('Chat'));
        queue(kept);
        expect(kept.destroyedWith).toBeNull();
        expect(kept.acknowledged).toBeTrue();
    });

    it('ao ser destruído devolve o banner original e solta bandeja, fontes e chave', async () => {
        const chat = new FakeSource('Chat');
        messageTray.addSource(chat);
        const trayConnections = messageTray.connections();
        const connect = spyOn(settings, 'connect').and.callThrough();
        const service = create();
        const bannersId = connect.calls.mostRecent().returnValue;
        queue(new FakeNotification(chat, {isTransient: true}));
        service.destroy();
        bridge = null;
        expect(Object.hasOwn(messageTray, '_showNotification')).toBeFalse();
        expect(messageTray.connections()).toBe(trayConnections);
        expect(chat.connections()).toBe(0);
        expect(GObject.signal_handler_is_connected(settings, bannersId)).toBeFalse();
        await settle();
        expect(messageTray.stateUpdates).toBe(0);
        const shown = new FakeNotification(chat);
        queue(shown);
        expect(messageTray.shownByShell).toEqual([shown]);
    });

    it('usa o ícone da notificação e cai no ícone da fonte', () => {
        const sourceIcon = {name: 'fonte'};
        const ownIcon = {name: 'própria'};
        const source = new FakeSource('App', sourceIcon);
        expect(notificationIcon(new FakeNotification(source, {gicon: ownIcon}) as unknown as NotificationArg)).toBe(
            ownIcon as unknown as Gio.Icon,
        );
        expect(notificationIcon(new FakeNotification(source) as unknown as NotificationArg)).toBe(sourceIcon as unknown as Gio.Icon);
        expect(notificationIcon(new FakeNotification(null) as unknown as NotificationArg)).toBeNull();
    });
});
