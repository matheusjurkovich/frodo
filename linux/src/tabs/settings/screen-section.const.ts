import type {MonitorMode, PillPosition, SurfaceStyle} from '../../settings/schema-values.types.js';

export const MONITORS: readonly {id: MonitorMode; label: string}[] = [
    {id: 'primary', label: 'Principal'},
    {id: 'secondary', label: 'Secundário'},
    {id: 'both', label: 'Ambos'},
];

export const SURFACES: readonly {id: SurfaceStyle; label: string}[] = [
    {id: 'solid', label: 'Sólido'},
    {id: 'frosted', label: 'Fosco'},
    {id: 'clear', label: 'Translúcido'},
];

export const POSITION_GRID: readonly (readonly ({id: PillPosition; label: string} | null)[])[] = [
    [
        {id: 'left', label: 'Topo, à esquerda'},
        {id: 'center', label: 'Topo, ao centro'},
        {id: 'right', label: 'Topo, à direita'},
    ],
    [{id: 'middle-left', label: 'Meio, à esquerda'}, null, {id: 'middle-right', label: 'Meio, à direita'}],
    [
        {id: 'bottom-left', label: 'Embaixo, à esquerda'},
        {id: 'bottom-center', label: 'Embaixo, ao centro'},
        {id: 'bottom-right', label: 'Embaixo, à direita'},
    ],
];
