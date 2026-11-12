import Foundation
import Testing

@testable import FrodoCore

private func ints(_ values: Int...) -> [Int] {
    values
}

private func doubles(_ values: Double...) -> [Double] {
    values
}

private let gib = 1_073_741_824.0
private let mib = 1_048_576.0

@Suite("desempenho")
struct PerformanceTests {
    @Test("calcula o uso de cpu pela diferença entre amostras")
    func cpuUsageFromDelta() {
        #expect(abs(cpuUsage(CpuTimes(busy: 150, total: 1000), CpuTimes(busy: 200, total: 1100)) - 0.5) < 1e-9)
        #expect(cpuUsage(CpuTimes(busy: 150, total: 1000), CpuTimes(busy: 150, total: 1000)) == 0)
        #expect(cpuUsage(CpuTimes(busy: 150, total: 1000), CpuTimes(busy: 100, total: 1100)) == 0)
    }

    @Test("protege processo de outro usuário e os essenciais da sessão")
    func protectsOtherUsersAndSessionEssentials() {
        #expect(!isProtected(name: "Safari", uid: 501, ownUid: 501))
        #expect(isProtected(name: "Safari", uid: 0, ownUid: 501))
        #expect(isProtected(name: "WindowServer", uid: 501, ownUid: 501))
        for name in ["launchd", "WindowServer", "loginwindow", "kernel_task", "Dock", "Finder", "SystemUIServer", "Frodo"] {
            #expect(isProtected(name: name, uid: 501, ownUid: 501))
        }
    }

    @Test("ordena e corta o topo")
    func sortsAndCutsTop() {
        #expect(topBy([3, 9, 1, 7], count: 2) { Double($0) } == ints(9, 7))
    }

    @Test("ordena o topo sem alterar a lista e mantém a ordem dos empates")
    func keepsTiesInOrder() {
        let items: [(id: String, v: Double)] = [("a", 1), ("b", 5), ("c", 5), ("d", 3)]
        #expect(topBy(items, count: 3) { $0.v }.map(\.id) == ["b", "c", "d"])
        #expect(topBy(items, count: 10) { $0.v }.map(\.id) == ["b", "c", "d", "a"])
        #expect(items.map(\.id) == ["a", "b", "c", "d"])
    }

    @Test("calcula a cpu do processo pelos ticks e zera sem amostra anterior")
    func processCpuFromNanos() {
        #expect(processCpu(previousNanos: nil, nanos: 5_000_000_000, elapsedSeconds: 2, cores: 4) == 0)
        #expect(processCpu(previousNanos: 1_000_000_000, nanos: 5_000_000_000, elapsedSeconds: 0, cores: 4) == 0)
        #expect(abs(processCpu(previousNanos: 1_000_000_000, nanos: 1_400_000_000, elapsedSeconds: 1, cores: 4) - 0.1) < 1e-9)
        #expect(processCpu(previousNanos: 1_000_000_000, nanos: 900_000_000, elapsedSeconds: 1, cores: 4) == 0)
    }

    @Test("mantém o histórico no tamanho pedido")
    func keepsHistorySize() {
        #expect(pushHistory(doubles(1, 2, 3), 4, size: 3) == doubles(2, 3, 4))
        #expect(pushHistory([], 1, size: 3) == doubles(1))
    }

    @Test("formata bytes, taxa, porcentagem e monograma em pt-BR")
    func formatsInPortuguese() {
        #expect(formatBytes(9.4 * gib) == "9,4 GB")
        #expect(formatBytes(730 * mib) == "730 MB")
        #expect(formatBytes(334.2 * gib) == "334 GB")
        #expect(formatRate(12 * mib) == "12 MB/s")
        #expect(formatRate(300 * 1024) == "300 kB/s")
        #expect(formatPercent(0.184) == "18,4%")
        #expect(monogram("firefox") == "Fi")
        #expect(monogram("VS Code") == "Vs")
    }
}
