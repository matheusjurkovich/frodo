import type Clutter from 'gi://Clutter';
import type GObject from 'gi://GObject';

export interface Mirror {
    readonly clone: Clutter.Clone;
    readonly binding: GObject.Binding;
}
