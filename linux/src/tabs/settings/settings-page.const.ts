import type {SettingsKey} from '../../settings/frodo-settings.types.js';
import type {FrodoIconName} from '../../shared/ui/icons.types.js';
import type {SectionId} from './settings-page.types.js';

export const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';

export const SECTIONS: readonly {id: SectionId; label: string; icon: FrodoIconName}[] = [
    {id: 'general', label: 'Geral', icon: 'gear'},
    {id: 'screen', label: 'Tela e posição', icon: 'expand'},
    {id: 'pill', label: 'Pílula', icon: 'general'},
    {id: 'tabs', label: 'Abas', icon: 'workspaces'},
    {id: 'ai', label: 'IA', icon: 'claude'},
    {id: 'agenda', label: 'Agenda', icon: 'calendar'},
];

export const SYNC_KEYS: readonly SettingsKey[] = [
    'closed-mode',
    'rotate-seconds',
    'pill-position',
    'open-on-hover',
    'auto-close',
    'always-show-pill',
    'hidden-tabs',
    'monitors',
    'hide-top-bar',
    'surface-style',
    'claude-poll-minutes',
    'claude-show-remaining',
    'toggle-shortcut',
    'claude-shortcut',
    'disabled-ai',
    'gemini-daily-limit',
    'meeting-notice-minutes',
    'peek-clock',
    'peek-every-minutes',
    'peek-seconds',
    'ram-percent',
    'pill-ai-activity',
    'notify-done',
    'notify-quota',
];
