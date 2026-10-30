import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {frodoIcon} from './icons.js';
import {PROVIDER_ICONS} from './provider-tile.js';
import {PROVIDER_NAMES} from '../ai-provider.js';
import type {AiProvider} from '../ai-provider.js';

export class ProviderNotifier {
    readonly #sources = new Map<AiProvider, MessageTray.Source>();

    notify(provider: AiProvider, title: string, body: string): void {
        const source = this.#source(provider);
        source.addNotification(new MessageTray.Notification({source, title, body, isTransient: true}));
    }

    #source(provider: AiProvider): MessageTray.Source {
        const existing = this.#sources.get(provider);
        if (existing) return existing;
        const source = new MessageTray.Source({title: PROVIDER_NAMES[provider], icon: frodoIcon(PROVIDER_ICONS[provider])});
        source.connect('destroy', () => {
            if (this.#sources.get(provider) === source) this.#sources.delete(provider);
        });
        Main.messageTray.add(source);
        this.#sources.set(provider, source);
        return source;
    }

    destroy(): void {
        for (const source of [...this.#sources.values()]) source.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
        this.#sources.clear();
    }
}
