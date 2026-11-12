import Foundation

private let windowNames = ["session": "5 h", "weekly": "semana"]
private let claudeRoles: [(key: String, role: WindowRole)] = [("session", .session), ("weekly", .weekly)]

private func reading(_ provider: AiProvider, id: String, window: String, percent: Double) -> QuotaReading {
    QuotaReading(id: id, provider: provider, name: provider.name, window: window, percent: percent)
}

public func quotaReadings(
    claude: (configDir: String, windows: [UsageWindow])?, codex: [Meter], gemini: [Meter], enabled: (AiProvider) -> Bool
) -> [QuotaReading] {
    var readings: [QuotaReading] = []
    if enabled(.claude), let claude {
        for (key, role) in claudeRoles {
            guard let window = claude.windows.first(where: { $0.role == role }), let name = windowNames[key] else { continue }
            readings.append(reading(.claude, id: "claude:\(claude.configDir):\(key)", window: name, percent: window.utilization))
        }
    }
    if enabled(.codex) {
        for meter in codex {
            guard let name = windowNames[meter.key] else { continue }
            readings.append(reading(.codex, id: "codex:\(meter.key)", window: name, percent: meter.percent))
        }
    }
    if enabled(.gemini) {
        for meter in gemini where meter.key == "daily" {
            readings.append(reading(.gemini, id: "gemini:daily", window: "dia", percent: meter.percent))
        }
    }
    return readings
}
