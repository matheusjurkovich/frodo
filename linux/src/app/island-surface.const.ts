import type {SurfaceStyle} from '../settings/schema-values.types.js';
import type {GlassLook} from '../shared/ui/glass.types.js';

export const GLASS_LOOKS: Record<Exclude<SurfaceStyle, 'solid'>, GlassLook> = {
    frosted: {radius: 40, brightness: 0.6},
    clear: {radius: 20, brightness: 0.32},
};
