import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {alertTitle} from '../features/github/github.js';
import type {ClassifiedPr} from '../features/github/github.types.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {Unsubscribe} from '../shared/emitter.types.js';
import {quietNotificationPolicy} from '../shared/shell-internals.js';
import {frodoIcon} from '../shared/ui/icons.js';
import type {GitHubNotifierDependencies} from './github-notifier.types.js';

export class GitHubNotifier {
    readonly #settings: FrodoSettings;
    readonly #off: Unsubscribe;
    #source: MessageTray.Source | null = null;

    constructor({settings, github}: GitHubNotifierDependencies) {
        this.#settings = settings;
        this.#off = github.on('alert', prs => {
            this.#notify(prs);
        });
    }

    #notify(prs: readonly ClassifiedPr[]): void {
        if (!this.#settings.githubNotify) return;
        const source = this.#ensureSource();
        for (const pr of prs) {
            const notification = new MessageTray.Notification({source, title: alertTitle(pr), body: pr.title});
            notification.connect('activated', () => {
                Gio.AppInfo.launch_default_for_uri(pr.url, null);
            });
            source.addNotification(notification);
        }
    }

    #ensureSource(): MessageTray.Source {
        if (this.#source) return this.#source;
        const source = new MessageTray.Source({title: 'GitHub', icon: frodoIcon('github'), policy: quietNotificationPolicy()});
        source.connect('destroy', () => {
            if (this.#source === source) this.#source = null;
        });
        Main.messageTray.add(source);
        this.#source = source;
        return source;
    }

    destroy(): void {
        this.#off();
        this.#source?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
        this.#source = null;
    }
}
