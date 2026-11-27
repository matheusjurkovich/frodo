import {Disposables} from '../shared/disposables.js';
import {Glass} from '../shared/ui/glass.js';
import {onSurfaceStyleChanged, surfaceClasses, surfaceStyle} from '../pill/surface-style.js';
import {GLASS_LOOKS} from './island-surface.const.js';
import type {IslandSurfaceDependencies} from './island-surface.types.js';

export class IslandSurface {
    readonly #dependencies: IslandSurfaceDependencies;
    readonly #disposables = new Disposables();
    #backdropGlass: Glass | null = null;
    #pillGlass: Glass | null = null;
    #classes: string[] = [];

    constructor(dependencies: IslandSurfaceDependencies) {
        this.#dependencies = dependencies;
        this.#disposables.add(
            onSurfaceStyleChanged(dependencies.settings, () => {
                this.sync();
            }),
        );
        this.#disposables.add(() => {
            this.#dropGlass();
        });
    }

    sync(): void {
        const {settings, backdrop, panel, tongue, pill} = this.#dependencies;
        const style = surfaceStyle(settings);
        const surfaces = [backdrop, panel, tongue];
        for (const surface of surfaces) for (const name of this.#classes) surface.remove_style_class_name(name);
        this.#classes = surfaceClasses(style);
        for (const surface of surfaces) for (const name of this.#classes) surface.add_style_class_name(name);
        if (style === 'solid') {
            this.#dropGlass();
            return;
        }
        const look = GLASS_LOOKS[style];
        this.#backdropGlass ??= new Glass(backdrop);
        this.#pillGlass ??= new Glass(pill);
        this.#backdropGlass.look(look);
        this.#pillGlass.look(look);
    }

    destroy(): void {
        this.#disposables.dispose();
    }

    #dropGlass(): void {
        this.#backdropGlass?.destroy();
        this.#backdropGlass = null;
        this.#pillGlass?.destroy();
        this.#pillGlass = null;
    }
}
