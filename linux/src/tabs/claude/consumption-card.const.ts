import type {ConsumptionSummary, Period} from '../../shared/consumption.types.js';
import {formatTokens} from '../../shared/format.js';

export const PERIODS: Record<Period, {label: string; chart: string}> = {
    today: {label: 'Hoje', chart: 'Tokens por hora · hoje'},
    '7d': {label: '7 dias', chart: 'Tokens por dia · últimos 7 dias'},
    '30d': {label: '30 dias', chart: 'Tokens por dia · últimos 30 dias'},
};

export const ORDER: readonly Period[] = ['today', '7d', '30d'];

export const STATS: readonly {name: string; text: (summary: ConsumptionSummary) => string}[] = [
    {name: 'Entrada', text: ({input}) => formatTokens(input)},
    {name: 'Saída', text: ({output}) => formatTokens(output)},
    {name: 'Cache lido', text: ({cacheRead}) => formatTokens(cacheRead)},
    {name: 'Sessões', text: ({sessions}) => String(sessions)},
];
