import {MEETING_NOTICE_MINUTES} from '../../settings/schema-values.const.js';

export const NOTICES: readonly {id: string; label: string}[] = MEETING_NOTICE_MINUTES.map(minutes => ({
    id: String(minutes),
    label: minutes === 0 ? 'Não avisar' : `${minutes} min`,
}));
