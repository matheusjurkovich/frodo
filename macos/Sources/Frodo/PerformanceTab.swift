import FrodoCore
import FrodoPlatform
import SwiftUI

private let dash = "—"

struct PerformanceTab: View {
    let services: FrodoServices

    var body: some View {
        let _ = services.revisions.performance
        let performance = services.performance
        let snapshot = performance.snapshot
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                MetricCard(
                    title: "CPU", tag: snapshot.map { "\($0.cores) núcleos" } ?? "", value: snapshot.map { formatPercent($0.cpu) } ?? dash,
                    graph: .spark(performance.history)
                )
                memoryCard(snapshot)
                MetricCard(
                    title: "GPU", value: snapshot?.gpu.map(formatPercent) ?? dash, graph: .spark(performance.gpuHistory),
                    first: snapshot?.gpu == nil ? "Sem leitura de uso nesta GPU" : "Uso total da GPU"
                )
                diskCard(snapshot)
            }
            ProcessTable(services: services)
        }
        .onAppear { performance.setWanted(true) }
        .onDisappear { performance.setWanted(false) }
    }

    private func memoryCard(_ snapshot: PerformanceSnapshot?) -> MetricCard {
        guard let memory = snapshot?.memory else { return MetricCard(title: "Memória", value: dash, graph: .bar(0)) }
        let total = Double(memory.totalBytes)
        let swap = snapshot?.swap
        return MetricCard(
            title: "Memória", tag: formatBytes(total), value: formatBytes(Double(memory.usedBytes)), unit: "de \(formatBytes(total))",
            graph: .bar(Double(memory.usedBytes) / max(1, total)), first: "\(usedPercent(memory))% em uso",
            second: swap.map { $0.total > 0 ? "Swap \(formatBytes(Double($0.used)))" : "" } ?? ""
        )
    }

    private func diskCard(_ snapshot: PerformanceSnapshot?) -> MetricCard {
        guard let disk = snapshot?.disk else { return MetricCard(title: "Disco", tag: "/", value: dash, graph: .bar(0)) }
        let rate = snapshot?.diskRate
        return MetricCard(
            title: "Disco", tag: "/", value: formatBytes(Double(disk.used)), unit: "de \(formatBytes(Double(disk.total)))",
            graph: .bar(Double(disk.used) / max(1, Double(disk.total))), first: "Leitura \(rate.map { formatRate($0.read) } ?? dash)",
            second: "Escrita \(rate.map { formatRate($0.write) } ?? dash)"
        )
    }
}
