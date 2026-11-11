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
