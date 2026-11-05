import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {AiProvider} from '../ai-provider.types.js';
import {frodoIcon} from './icons.js';
import {PROVIDER_ICONS} from './provider-tile.const.js';

export function providerIcon(provider: AiProvider, styleClass = ''): St.Icon {
    return new St.Icon({
        gicon: frodoIcon(PROVIDER_ICONS[provider]),
        style_class: `frodo-provider-icon frodo-provider-${provider} ${styleClass}`.trim(),
    });
}

export function providerTile(provider: AiProvider, size: 20 | 28 | 32): St.Bin {
    const icon = providerIcon(provider);
    icon.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, x_expand: true, y_expand: true});
    return new St.Bin({
        style_class: `frodo-provider-tile frodo-provider-tile-${size} frodo-provider-${provider}`,
        child: icon,
        y_align: Clutter.ActorAlign.CENTER,
    });
}
