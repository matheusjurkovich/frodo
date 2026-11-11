import Clutter from 'gi://Clutter';
import {PEEK_EVERY_MINUTES, PEEK_SECONDS} from '../../settings/schema-values.const.js';
import type {ClosedMode, HorizontalPosition, PillAiActivity} from '../../settings/schema-values.types.js';
import type {NumberOption} from './settings-rows.types.js';

export const ROTATE_SECONDS = {min: 2, max: 30} as const;

export const PILL_MODES: readonly {id: ClosedMode; label: string}[] = [
    {id: 'minimal', label: 'Mínimo'},
    {id: 'compact', label: 'Compacto'},
    {id: 'rotating', label: 'Rotativo'},
];

export const MODE_HINTS: Record<ClosedMode, string> = {
    minimal: 'Só o relógio, a pílula mais discreta.',
    compact: 'Todos os itens aparecem ao mesmo tempo.',
    rotating: 'Bateria, RAM e as cotas de IA dividem um espaço e se revezam.',
};

export const AI_ACTIVITIES: readonly {id: PillAiActivity; label: string}[] = [
    {id: 'always', label: 'Sempre'},
    {id: 'change', label: 'Ao mudar'},
    {id: 'never', label: 'Nunca'},
];

export const ALIGN_BY_SIDE: Record<HorizontalPosition, Clutter.ActorAlign> = {
    left: Clutter.ActorAlign.START,
    center: Clutter.ActorAlign.CENTER,
    right: Clutter.ActorAlign.END,
};

export const PEEK_EVERY: readonly NumberOption[] = PEEK_EVERY_MINUTES.map(minutes => ({id: minutes, label: `${minutes} min`}));

export const PEEK_FOR: readonly NumberOption[] = PEEK_SECONDS.map(seconds => ({id: seconds, label: `${seconds} s`}));
