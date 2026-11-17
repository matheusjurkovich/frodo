declare module 'gi://Secret' {
    import type Gio from 'gi://Gio';

    namespace Secret {
        enum SchemaFlags {
            NONE = 0,
        }

        enum SchemaAttributeType {
            STRING = 0,
        }

        interface Schema {
            readonly name: string;
        }

        const Schema: {
            new: (name: string, flags: SchemaFlags, attributes: Record<string, SchemaAttributeType>) => Schema;
        };

        const COLLECTION_DEFAULT: string;

        function password_lookup(
            schema: Schema | null,
            attributes: Record<string, string>,
            cancellable: Gio.Cancellable | null,
            callback: (source: null, result: Gio.AsyncResult) => void,
        ): void;
        function password_lookup_finish(result: Gio.AsyncResult): string | null;
        function password_store(
            schema: Schema,
            attributes: Record<string, string>,
            collection: string | null,
            label: string,
            password: string,
            cancellable: Gio.Cancellable | null,
            callback: (source: null, result: Gio.AsyncResult) => void,
        ): void;
        function password_store_finish(result: Gio.AsyncResult): boolean;
        function password_clear(
            schema: Schema,
            attributes: Record<string, string>,
            cancellable: Gio.Cancellable | null,
            callback: (source: null, result: Gio.AsyncResult) => void,
        ): void;
        function password_clear_finish(result: Gio.AsyncResult): boolean;
    }

    export default Secret;
}
