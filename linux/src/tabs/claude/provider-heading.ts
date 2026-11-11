import Clutter from 'gi://Clutter';
import type St from 'gi://St';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {cardHeading} from '../../shared/ui/card.js';
import {row} from '../../shared/ui/layout.js';
import {providerTile} from '../../shared/ui/provider-tile.js';

export function providerHeading(provider: AiProvider, title: string): St.BoxLayout {
    const top = row('frodo-provider-heading');
    top.add_child(providerTile(provider, 28));
    const text = cardHeading(title);
    text.x_expand = true;
    text.y_align = Clutter.ActorAlign.CENTER;
    top.add_child(text);
    return top;
}
