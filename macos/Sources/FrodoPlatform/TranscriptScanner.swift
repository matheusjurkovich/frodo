import FrodoCore
import Foundation

private let cacheVersion = 4.0
private let chunkBytes = 1024 * 1024
private let keptSeconds: TimeInterval = 30 * 24 * 60 * 60
private let saveEvery: TimeInterval = 5 * 60

public actor TranscriptScanner {
    private let cachePath: String
    private var index = ClaudeIndex()
    private var offsets: [String: Int] = [:]
    private var loaded = false
    private var dirty = false
    private var savedAt = Date.distantPast

    public init(cachePath: String) {
        self.cachePath = cachePath
    }

    public func scan(configDirs: [String], now: Date, wanted: Bool) -> ClaudeIndex {
        loadIfNeeded()
        let listing = list(configDirs, since: now.addingTimeInterval(-keptSeconds))
        for (path, found) in listing.found.sorted(by: { $0.value.modified < $1.value.modified }) {
            read(path: path, size: found.size)
        }
        for path in offsets.keys where listing.found[path] == nil && listing.roots.contains(where: { path.hasPrefix($0) }) {
            offsets[path] = nil
            dirty = true
        }
        index.prune(now: now)
        if dirty && (!wanted || now.timeIntervalSince(savedAt) >= saveEvery) { save(now: now) }
        return index
    }

    public func flush() {
        if dirty { save(now: Date()) }
    }

    private func loadIfNeeded() {
        guard !loaded else { return }
        loaded = true
        guard let text = try? String(contentsOfFile: cachePath, encoding: .utf8), let data = JSONValue(text: text),
            data.field("version")?.finiteNumber == cacheVersion, let files = data.field("files")?.object,
            let stored = data.field("index")
        else { return }
        let restored = ClaudeIndex(json: stored)
        guard restored.toJSON() == stored else { return }
        var loadedOffsets: [String: Int] = [:]
        for (path, value) in files {
            guard case let .number(offset) = value, offset >= 0, offset == offset.rounded() else { return }
            loadedOffsets[path] = Int(offset)
        }
        index = restored
        offsets = loadedOffsets
    }

    private struct Found {
        let size: Int
        let modified: Date
    }

    private func list(_ configDirs: [String], since: Date) -> (found: [String: Found], roots: [String]) {
        var found: [String: Found] = [:]
        var roots: [String] = []
        let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
        for configDir in configDirs {
            let root = URL(fileURLWithPath: configDir).appendingPathComponent("projects")
            guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys) else { continue }
            roots.append(root.path + "/")
            for case let url as URL in enumerator where url.pathExtension == "jsonl" {
                guard let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true,
                    let modified = values.contentModificationDate, modified >= since
                else { continue }
                found[url.path] = Found(size: values.fileSize ?? 0, modified: modified)
            }
        }
        return (found, roots)
    }

    private func read(path: String, size: Int) {
        var offset = offsets[path] ?? 0
        if size < offset {
            offset = size
            offsets[path] = offset
            dirty = true
        }
        if size == offset { return }
        guard let handle = FileHandle(forReadingAtPath: path) else { return }
        defer { try? handle.close() }
        do {
            try handle.seek(toOffset: UInt64(offset))
            var rest = Data()
            var reading = true
            while reading {
                reading = try autoreleasepool {
                    guard let chunk = try handle.read(upToCount: chunkBytes), !chunk.isEmpty else { return false }
                    var bytes = rest
                    bytes.append(chunk)
                    let (text, consumed) = completeLines(bytes)
                    for line in text.split(separator: "\n") {
                        if let entry = parseAssistantLine(String(line)) { index.add(entry) }
                    }
                    if consumed > 0 { dirty = true }
                    offset += consumed
                    offsets[path] = offset
                    rest = Data(bytes.dropFirst(consumed))
                    return true
                }
            }
        } catch {
            return
        }
    }

    private func save(now: Date) {
        let files = JSONValue.object(offsets.mapValues { .number(Double($0)) })
        let value = JSONValue.object(["version": .number(cacheVersion), "index": index.toJSON(), "files": files])
        guard let data = try? JSONEncoder().encode(value) else { return }
        let directory = (cachePath as NSString).deletingLastPathComponent
        do {
            try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try data.write(to: URL(fileURLWithPath: cachePath), options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: cachePath)
            dirty = false
            savedAt = now
        } catch {
            dirty = true
        }
    }
}
