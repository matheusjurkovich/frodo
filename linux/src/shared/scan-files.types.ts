export interface LineSink {
    feed(text: string): void;
    line(raw: string): boolean;
}
