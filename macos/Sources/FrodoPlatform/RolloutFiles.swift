import FrodoCore
import Foundation

struct FileEntry: Sendable {
    let path: String
    let name: String
    let isDirectory: Bool
    let isRegular: Bool
    let size: Int
    let modified: Date

    var key: String {
        "\(modified.timeIntervalSince1970):\(size)"
    }
}

protocol LineSink: AnyObject {
    func feed(_ text: String)
    func line(_ raw: String) -> Bool
}

extension RolloutParser: LineSink {}
extension GeminiSessionParser: LineSink {}

private let entryKeys: [URLResourceKey] = [.isDirectoryKey, .isRegularFileKey, .fileSizeKey, .contentModificationDateKey]

func directoryExists(_ path: String) -> Bool {
    var directory: ObjCBool = false
    return FileManager.default.fileExists(atPath: path, isDirectory: &directory) && directory.boolValue
}

func listEntries(_ dir: String) -> [FileEntry]? {
    guard FileManager.default.fileExists(atPath: dir) else { return [] }
    guard let urls = try? FileManager.default.contentsOfDirectory(at: URL(fileURLWithPath: dir, isDirectory: true), includingPropertiesForKeys: entryKeys)
    else { return nil }
    return urls.compactMap { url in
        guard let values = try? url.resourceValues(forKeys: Set(entryKeys)) else { return nil }
        return FileEntry(
            path: "\(dir)/\(url.lastPathComponent)", name: url.lastPathComponent, isDirectory: values.isDirectory ?? false,
            isRegular: values.isRegularFile ?? false, size: values.fileSize ?? 0, modified: values.contentModificationDate ?? .distantPast
        )
    }
}

func readRange(_ path: String, from offset: Int, count: Int) -> Data? {
    guard let handle = FileHandle(forReadingAtPath: path) else { return nil }
    defer { try? handle.close() }
    guard count > 0 else { return Data() }
    do {
        try handle.seek(toOffset: UInt64(offset))
        return try handle.read(upToCount: count) ?? Data()
    } catch {
        return nil
    }
}

func consumeLines(_ data: Data, into sink: LineSink) -> Int {
    let bytes = [UInt8](data)
    let end = (bytes.lastIndex(of: 10) ?? -1) + 1
    if end > 0 { sink.feed(String(decoding: bytes[..<end], as: UTF8.self)) }
    let rest = bytes[end...]
    return !rest.isEmpty && sink.line(String(decoding: rest, as: UTF8.self)) ? bytes.count : end
}
