import St from 'gi://St';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {SurfaceStyle} from '../settings/schema-values.types.js';
import type {Disposer} from '../shared/disposables.types.js';

export function surfaceStyle(settings: FrodoSettings): SurfaceStyle {
    return St.Settings.get().high_contrast ? 'solid' : settings.surfaceStyle;
}

export function surfaceClasses(style: SurfaceStyle): string[] {
    return style === 'solid' ? [] : [`frodo-surface-${style}`, 'frodo-surface-glass'];
}

export function onSurfaceStyleChanged(settings: FrodoSettings, callback: () => void): Disposer {
    const system = St.Settings.get();
    const id = system.connect('notify::high-contrast', callback);
    const off = settings.onChanged('surface-style', callback);
    return () => {
        system.disconnect(id);
        off();
    };
}
