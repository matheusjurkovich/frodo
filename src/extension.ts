import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ClaudeService} from './features/claude/claude-service.js';
import {ClaudeSessions} from './features/claude/claude-sessions-service.js';
import {ClaudeTranscripts} from './features/claude/claude-transcripts-service.js';
import {MediaService} from './features/media/media-service.js';
import {UpcomingMeeting} from './features/meetings/meetings-service.js';
import {NotificationBridge} from './features/notifications/notification-bridge-service.js';
import {Recording} from './features/system/recording-service.js';
import {FrodoSettings} from './settings/frodo-settings.js';
import {SystemState} from './features/system/system-state-service.js';
import {VolumeWatch} from './features/system/volume-service.js';
import {Workspaces} from './features/workspaces/workspaces-service.js';
import {IslandManager} from './app/island-manager.js';
import {setIconsDirectory} from './shared/ui/icons.js';
import {ActivityFeed} from './pill/activity-feed.js';
import {TopBarVisibility} from './app/top-bar-visibility.js';
import {Disposables} from './shared/disposables.js';

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
