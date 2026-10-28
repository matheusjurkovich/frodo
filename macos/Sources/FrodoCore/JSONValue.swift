import Foundation

public enum JSONValue: Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init?(text: String) {
        guard let data = text.data(using: .utf8) else { return nil }
        self.init(data: data)
    }

    public init?(data: Data) {
        guard let value = try? JSONDecoder().decode(JSONValue.self, from: data) else { return nil }
        self = value
    }

    public func field(_ path: String...) -> JSONValue? {
        var current: JSONValue? = self
        for key in path {
            current = current?.object?[key]
        }
        return current
    }

    public var object: [String: JSONValue]? {
        if case let .object(value) = self { value } else { nil }
    }

    public var array: [JSONValue]? {
        if case let .array(value) = self { value } else { nil }
    }

    public var string: String? {
        if case let .string(value) = self { value } else { nil }
    }

    public var nonEmptyString: String? {
        guard let value = string, !value.isEmpty else { return nil }
        return value
    }

    public var bool: Bool? {
        if case let .bool(value) = self { value } else { nil }
    }

    public var finiteNumber: Double? {
        switch self {
        case let .number(value):
            return value.isFinite ? value : nil
        case let .string(value):
            guard !value.isEmpty, let number = Double(value.trimmingCharacters(in: .whitespaces)), number.isFinite else { return nil }
            return number
        default:
            return nil
        }
    }
}

extension JSONValue: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case let .bool(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .string(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        }
    }
}

public func parseISODate(_ text: String) -> Date? {
    if let date = try? Date(text, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) { return date }
    return try? Date(text, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: false))
}
