import type {FrodoIconName} from '../../shared/ui/icons.types.js';
import type {SectionId} from './settings-page.types.js';

export const SECTIONS: readonly {id: SectionId; label: string; icon: FrodoIconName}[] = [
    {id: 'general', label: 'Geral', icon: 'general'},
    {id: 'screen', label: 'Tela e posição', icon: 'monitor'},
    {id: 'pill', label: 'Pílula', icon: 'pill'},
    {id: 'tabs', label: 'Abas', icon: 'app-window'},
    {id: 'ai', label: 'IA', icon: 'sparkle'},
    {id: 'github', label: 'GitHub', icon: 'github'},
    {id: 'agenda', label: 'Agenda', icon: 'calendar'},
];
