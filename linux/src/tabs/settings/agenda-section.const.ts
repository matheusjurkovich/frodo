import type {NumberOption} from './settings-rows.types.js';
import {MEETING_NOTICE_MINUTES} from '../../settings/schema-values.const.js';

export const NOTICES: readonly NumberOption[] = MEETING_NOTICE_MINUTES.map(minutes => ({
    id: minutes,
    label: minutes === 0 ? 'Não avisar' : `${minutes} min`,
}));
