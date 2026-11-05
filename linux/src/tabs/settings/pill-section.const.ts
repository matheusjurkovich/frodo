import {PEEK_EVERY_MINUTES, PEEK_SECONDS} from '../../settings/schema-values.const.js';
import type {ClosedMode} from '../../settings/schema-values.types.js';

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

export const PEEK_EVERY: readonly {id: string; label: string}[] = PEEK_EVERY_MINUTES.map(minutes => ({
    id: String(minutes),
    label: `${minutes} min`,
}));

export const PEEK_FOR: readonly {id: string; label: string}[] = PEEK_SECONDS.map(seconds => ({id: String(seconds), label: `${seconds} s`}));
