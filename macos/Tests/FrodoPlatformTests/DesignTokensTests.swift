import Foundation
import Testing

private let repoRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent()
private let appSources = repoRoot.appendingPathComponent("macos/Sources/Frodo")

private func read(_ url: URL) throws -> String {
    try String(contentsOf: url, encoding: .utf8)
}

private func captures(_ pattern: String, in text: String) -> [[String]] {
    let regex = try! NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines])
    return regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).map { match in
        (1 ..< match.numberOfRanges).map { index in
            Range(match.range(at: index), in: text).map { String(text[$0]) } ?? ""
        }
    }
}

private func block(_ name: String, in text: String) -> String {
    guard let start = text.range(of: "\n\(name)\n") else { return "" }
    let rest = text[start.upperBound...]
    let end = rest.range(of: "\n[a-z]", options: .regularExpression)?.lowerBound ?? rest.endIndex
    return String(rest[..<end])
}

private struct DesignTokens {
    let colors: Set<String>
    let fontSizes: Set<String>
    let radii: Set<String>

    init() throws {
        let design = try read(repoRoot.appendingPathComponent("DESIGN.md"))
        let front = design.components(separatedBy: "\n---\n")[0]
        colors = Set(captures("^  [a-z-]+: \"([^\"]+)\"$", in: block("colors:", in: front)).map { $0[0].lowercased() })
        fontSizes = Set(captures("fontSize: \"([0-9]+)px\"", in: block("typography:", in: front)).map { $0[0] })
        radii = Set(captures("^  [a-z0-9-]+: \"([0-9]+)(?:px)?\"$", in: block("rounded:", in: front)).map { $0[0] })
    }
}

private func theme() throws -> String {
    let text = try read(appSources.appendingPathComponent("Theme.swift"))
    return text.components(separatedBy: "enum Snapshot")[0]
}

private func viewSources() throws -> [(name: String, text: String)] {
    try FileManager.default.contentsOfDirectory(atPath: appSources.path).sorted()
        .filter { $0.hasSuffix(".swift") && $0 != "Theme.swift" && $0 != "Snapshots.swift" }
        .map { ($0, try read(appSources.appendingPathComponent($0))) }
}

private func rgba(_ hex: String, _ opacity: String) -> String {
    let value = UInt32(hex, radix: 16)!
    return "rgba(\((value >> 16) & 0xFF), \((value >> 8) & 0xFF), \(value & 0xFF), \(opacity))"
}

@Suite("tokens do Theme contra o DESIGN.md")
struct DesignTokensTests {
    @Test("toda cor do Theme está no DESIGN.md")
    func colors() throws {
        let tokens = try DesignTokens()
        let text = try theme()
        var used: [String] = []
        for match in captures("Color\\(hex: 0x([0-9A-Fa-f]{6})(?:, opacity: ([0-9.]+))?\\)", in: text) {
            used.append(match[1].isEmpty ? "#\(match[0].lowercased())" : rgba(match[0], match[1]))
        }
        for match in captures("Color\\.white\\.opacity\\(([0-9.]+)\\)", in: text) {
            used.append(rgba("FFFFFF", match[0]))
        }
        #expect(!used.isEmpty)
        #expect(used.filter { !tokens.colors.contains($0) } == [])
    }

    @Test("tamanho de fonte só no Theme e só os do DESIGN.md")
    func fontSizes() throws {
        let tokens = try DesignTokens()
        let sizes = captures("\\.system\\(size: ([0-9.]+)", in: try theme()).map { $0[0] }
        #expect(!sizes.isEmpty)
        #expect(sizes.filter { !tokens.fontSizes.contains($0) } == [])
        let outside = try viewSources().filter { $0.text.contains(".system(size:") }.map(\.name)
        #expect(outside == [])
    }

    @Test("raio só pelo Theme.Radius e só os do DESIGN.md")
    func radii() throws {
        let tokens = try DesignTokens()
        let radius = try theme().components(separatedBy: "enum Radius {")[1].components(separatedBy: "}")[0]
        let values = captures("CGFloat = ([0-9]+)$", in: radius).map { $0[0] }
        #expect(values.count >= 5)
        #expect(values.filter { !tokens.radii.contains($0) } == [])
        let literal = "cornerRadius: [0-9]|(?:innerCard|Background)\\([^)]*radius: [0-9]"
        let outside = try viewSources().filter { !captures("(\(literal))", in: $0.text).isEmpty }.map(\.name)
        #expect(outside == [])
    }
}
