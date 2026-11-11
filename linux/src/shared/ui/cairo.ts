import type cairo from 'cairo';
import type {ThemeColor} from './cairo.types.js';

export function setSourceColor(cr: cairo.Context, color: ThemeColor): void {
    cr.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, color.alpha / 255);
}
