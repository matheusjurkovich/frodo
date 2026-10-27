import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ClaudeService} from './services/claude-service.js';
import {ClaudeSessions} from './services/claude-sessions.js';
import {ClaudeTranscripts} from './services/claude-transcripts.js';
import {MediaService} from './services/media.js';
import {UpcomingMeeting} from './services/meetings.js';
import {NotificationBridge} from './services/notification-bridge.js';
import {Recording} from './services/recording.js';
import {FrodoSettings} from './services/settings.js';
import {SystemState} from './services/system-state.js';
import {VolumeWatch} from './services/volume.js';
import {Workspaces} from './services/workspaces.js';
import {IslandManager} from './ui/island-manager.js';
import {setIconsDirectory} from './ui/icons.js';
import {ActivityFeed} from './ui/pill/activity-feed.js';
import {TopBarVisibility} from './ui/top-bar-visibility.js';
import {Disposables} from './util/disposables.js';

const TOGGLE_KEYBINDING = 'toggle-shortcut';
const CLAUDE_KEYBINDING = 'claude-shortcut';

export default class FrodoExtension extends Extension {
    #disposables: Disposables | null = null;

    override enable(): void {
        const disposables = new Disposables();
        this.#disposables = disposables;
        try {
            this.#start(disposables);
        } catch (error) {
            disposables.dispose();
            this.#disposables = null;
            throw error;
        }
    }

    #start(disposables: Disposables): void {
        setIconsDirectory(`${this.path}/icons`);
        disposables.add(() => {
            setIconsDirectory(null);
        });

        const settings = new FrodoSettings(this.getSettings());
        const state = new SystemState();
        disposables.add(() => {
            state.destroy();
        });
        const claude = new ClaudeService(settings);
        disposables.add(() => {
            claude.destroy();
        });
        const transcripts = new ClaudeTranscripts(settings);
        disposables.add(() => {
            transcripts.destroy();
        });
        const sessions = new ClaudeSessions(settings, undefined, window => {
            Main.activateWindow(window);
        });
        disposables.add(() => {
            sessions.destroy();
        });
        const media = new MediaService();
        disposables.add(() => {
            media.destroy();
        });
        const workspaces = new Workspaces();
        disposables.add(() => {
            workspaces.destroy();
        });
        const bridge = new NotificationBridge();
        disposables.add(() => {
            bridge.destroy();
        });
        const recording = new Recording();
        disposables.add(() => {
            recording.destroy();
        });
        const volume = new VolumeWatch();
        disposables.add(() => {
            volume.destroy();
        });
        const meetings = new UpcomingMeeting();
        disposables.add(() => {
            meetings.destroy();
        });
        const feed = new ActivityFeed({recording, sessions, meetings, bridge, volume, media});
        disposables.add(() => {
            feed.destroy();
        });
        const topBar = new TopBarVisibility(settings);
        disposables.add(() => {
            topBar.destroy();
        });

        const islands = new IslandManager({
            settings,
            state,
            claude,
            transcripts,
            sessions,
            bridge,
            media,
            workspaces,
            feed,
            recording,
            openPreferences: () => {
                islands.closeAll();
                this.openPreferences();
            },
        });
        disposables.add(() => {
            islands.destroy();
        });

        for (const [name, action] of [
            [
                TOGGLE_KEYBINDING,
                (): void => {
                    islands.toggle();
                },
            ],
            [
                CLAUDE_KEYBINDING,
                (): void => {
                    islands.show('claude');
                },
            ],
        ] as const) {
            Main.wm.addKeybinding(
                name,
                settings.gsettings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
                action,
            );
            disposables.add(() => {
                Main.wm.removeKeybinding(name);
            });
        }
    }

    override disable(): void {
        this.#disposables?.dispose();
        this.#disposables = null;
    }
}
