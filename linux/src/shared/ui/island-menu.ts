import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {Disposables} from '../disposables.js';
import type {IslandHandle} from '../island-handle.types.js';

export function islandMenu(
    island: IslandHandle,
    source: St.Button,
    alignment: number,
    disposables: Disposables,
    styleClasses: readonly string[],
): PopupMenu.PopupMenu {
    const menu = new PopupMenu.PopupMenu(source, alignment, St.Side.TOP);
    for (const styleClass of styleClasses) menu.box.add_style_class_name(styleClass);
    new PopupMenu.PopupMenuManager(source).addMenu(menu);
    Main.layoutManager.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    disposables.add(() => {
        menu.destroy();
    });
    disposables.add(island.holdWhileOpen(menu));
    disposables.add(
        island.on('closed', () => {
            menu.close();
        }),
    );
    return menu;
}
