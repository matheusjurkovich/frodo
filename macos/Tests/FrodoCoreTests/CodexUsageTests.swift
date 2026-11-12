import Foundation
import Testing

@testable import FrodoCore

private func at(_ minute: Int) -> String {
    Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(localDate(2026, 10, 27, 10, minute))
}

private func json(_ value: [String: Any]) -> String {
    let data = (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])) ?? Data()
    return String(decoding: data, as: UTF8.self)
}

private let meta = json(["timestamp": at(0), "type": "session_meta", "payload": ["id": "sess-1", "cwd": "/home/u/frodo"]])

private func context(_ model: String, _ minute: Int) -> String {
    json(["timestamp": at(minute), "type": "turn_context", "payload": ["model": model]])
}

private func tokens(_ minute: Int, input: Int, cached: Int, output: Int, total: Int, limits: Bool = false) -> String {
    let last: [String: Any] = [
        "input_tokens": input, "cached_input_tokens": cached, "output_tokens": output,
        "reasoning_output_tokens": 1, "total_tokens": input + output,
    ]
    var totalUsage = last
    totalUsage["total_tokens"] = total
    let rates: Any =
        limits
        ? [
            "primary": ["used_percent": 12.5, "window_minutes": 300, "resets_at": 1_791_594_223],
            "secondary": ["used_percent": 40, "window_minutes": 10080, "resets_at": 1_792_181_023],
            "plan_type": "plus",
        ] as [String: Any] : NSNull()
    return json([
        "timestamp": at(minute), "type": "event_msg",
        "payload": [
            "type": "token_count",
            "info": ["total_token_usage": totalUsage, "last_token_usage": last, "model_context_window": 258400],
            "rate_limits": rates,
        ],
    ])
}

private let rollout = [
    meta,
    context("gpt-5.6-sol", 1),
    tokens(2, input: 1000, cached: 800, output: 50, total: 1050),
    tokens(3, input: 1000, cached: 800, output: 50, total: 1050, limits: true),
    context("gpt-5.1-codex-mini", 4),
    tokens(5, input: 2000, cached: 1500, output: 100, total: 3150),
    tokens(6, input: 0, cached: 0, output: 0, total: 3200),
    "linha quebrada {",
].joined(separator: "\n")

private let expectedLimits = CodexLimits(
    plan: "plus",
    primary: RateWindow(usedPercent: 12.5, windowMinutes: 300, resetsAt: Date(timeIntervalSince1970: 1_791_594_223)),
    secondary: RateWindow(usedPercent: 40, windowMinutes: 10080, resetsAt: Date(timeIntervalSince1970: 1_792_181_023)),
    at: localDate(2026, 10, 27, 10, 3)
)

@Test("ignora linha que não é JSON de rollout")
func codexLineInvalid() {
    #expect(parseCodexLine("nada") == nil)
    #expect(parseCodexLine(json(["type": "x", "payload": [String: Any]()])) == nil)
    #expect(parseCodexLine(meta)?.type == "session_meta")
}

@Test("soma token_count sem repetir evento duplicado e separa o cache da entrada")
func codexCells() {
    let result = readRollout(rollout)
    #expect(result.id == "sess-1")
    let rows = result.cells.map { [$0.model, $0.project, $0.session, String($0.input), String($0.cacheRead), String($0.output)] }
    #expect(rows == [
        ["gpt-5.6-sol", "frodo", "sess-1", "200", "800", "50"],
        ["gpt-5.1-codex-mini", "frodo", "sess-1", "500", "1500", "100"],
    ])
}

@Test("guarda a sessão com o último contexto")
func codexSession() {
    #expect(readRollout(rollout).session == CodexSession(
        model: "gpt-5.1-codex-mini", tokens: 850, contextTokens: 2100, contextWindow: 258400,
        startedAt: localDate(2026, 10, 27, 10, 2), lastAt: localDate(2026, 10, 27, 10, 5)
    ))
}

@Test("lê os limites mais recentes")
func codexLimitsLatest() {
    #expect(readRollout(rollout).limits == expectedLimits)
    #expect(latestLimits(String(rollout.dropFirst(40))) == expectedLimits)
    #expect(latestLimits(meta) == nil)
}

@Test("com a última linha cortada no meio devolve os limites da linha completa anterior")
func codexLimitsTruncatedTail() {
    let tail = tokens(7, input: 5, cached: 0, output: 1, total: 3300, limits: true)
    #expect(latestLimits([rollout, String(tail.prefix(60))].joined(separator: "\n")) == expectedLimits)
}

@Test("aceita resets_in_seconds de versões antigas")
func codexLegacyReset() {
    let line = json([
        "timestamp": at(0), "type": "event_msg",
        "payload": [
            "type": "token_count", "info": NSNull(),
            "rate_limits": ["primary": ["used_percent": 5, "window_minutes": 300, "resets_in_seconds": 60]],
        ],
    ])
    #expect(latestLimits(line)?.primary?.resetsAt == localDate(2026, 10, 27, 10, 1))
}

@Test("nomeia o plano")
func codexPlanLabel() {
    #expect(planLabel("plus") == "Plus")
    #expect(planLabel("pro") == "Pro")
    #expect(planLabel("self_serve_business") == "Self Serve Business")
    #expect(planLabel(nil) == nil)
}

@Test("agrupa e rotula os modelos")
func codexModelGroups() {
    let models = ["gpt-5.6-sol", "gpt-5-codex", "gpt-5.1-codex-mini", "o3"]
    #expect(models.map(codexModels.family) == ["codex-gpt", "codex-codex", "codex-mini", "codex-other"])
    #expect(models.map(codexModels.label) == ["GPT-5.6 Sol", "GPT-5 Codex", "GPT-5.1 Codex Mini", "o3"])
}

@Test("converte as janelas em medidores e zera a que já reiniciou")
func codexMeterWindows() {
    let now = Date(timeIntervalSince1970: 1_793_000_000)
    let meters = codexMeters(
        CodexLimits(
            plan: "plus",
            primary: RateWindow(usedPercent: 41, windowMinutes: 300, resetsAt: now.addingTimeInterval(130 * 60)),
            secondary: RateWindow(usedPercent: 58, windowMinutes: 10080, resetsAt: now.addingTimeInterval(-0.001)),
            at: now
        ),
        now: now
    )
    #expect(meters.map(\.key) == ["session", "weekly"])
    #expect(meters.map(\.short) == ["Janela 5 h", "Semana"])
    #expect(meters.map(\.percent) == [41, 0])
    #expect(meters[0].note == "Reinicia em 2 h 10 min")
    #expect(codexMeters(nil, now: now) == [])
}

@Test("retoma a leitura do rollout de onde parou e fecha a linha incompleta depois")
func codexResume() {
    let header = json(["timestamp": at(0), "type": "session_meta", "payload": ["id": "a", "cwd": "/home/u/frodo"]])
    func turn(_ total: Int) -> String {
        json([
            "timestamp": at(1), "type": "event_msg",
            "payload": [
                "type": "token_count",
                "info": [
                    "total_token_usage": ["total_tokens": total],
                    "last_token_usage": ["input_tokens": 10, "cached_input_tokens": 0, "output_tokens": 1],
                ],
            ],
        ])
    }
    let whole = readRollout([header, turn(11), turn(22)].joined(separator: "\n"))
    let parser = RolloutParser()
    parser.feed("\(header)\n\(turn(11))\n")
    #expect(!parser.line(String(turn(22).prefix(20))))
    parser.feed("\(turn(22))\n")
    #expect(parser.cells == whole.cells)
    #expect(parser.session == whole.session)
    #expect(parser.limits == whole.limits)
    #expect(whole.session?.tokens == 22)
}

@Test("sabe quando a pasta de um dia já ficou para trás da janela")
func codexDayDirEnded() {
    let since = localDate(2026, 10, 28)
    #expect(dayDirEnded(["2025"], since: since))
    #expect(!dayDirEnded(["2026"], since: since))
    #expect(dayDirEnded(["2026", "08"], since: since))
    #expect(!dayDirEnded(["2026", "10"], since: since))
    #expect(dayDirEnded(["2026", "10", "25"], since: since))
    #expect(!dayDirEnded(["2026", "10", "27"], since: since))
    #expect(!dayDirEnded(["2026", "10", "28"], since: since))
    #expect(!dayDirEnded(["x"], since: since))
    #expect(!dayDirEnded(["2026", "x"], since: since))
}
