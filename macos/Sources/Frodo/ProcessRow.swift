import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

struct ProcessRow: View {
    let process: ProcessUsage
    let name: String
    let icon: NSImage?
    let share: Double
    let sort: ProcessSort
    let asking: Bool
    let ask: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 10) {
                badge
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(name).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                        Text("pid \(process.pid)").font(Theme.Font.mono(12)).foregroundStyle(Theme.Performance.muted)
                    }
                    ProgressBar(fraction: share, tint: Theme.accent.opacity(0.6), height: 3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            ForEach(ProcessSort.allCases, id: \.self) { column in
                Text(value(column))
                    .font(Theme.Font.mono(13))
                    .foregroundStyle(column == sort ? Theme.text : Theme.textSecondary)
                    .frame(width: 84, alignment: .trailing)
            }
            action.frame(width: 48, alignment: .trailing)
        }
        .padding(.vertical, 6)
        .overlay(alignment: .top) { Rectangle().fill(Theme.divider).frame(height: 1) }
    }

    private var badge: some View {
        Group {
            if let icon {
                Image(nsImage: icon).resizable().frame(width: 20, height: 20)
            } else {
                Text(monogram(name)).font(Theme.Font.label(.bold)).foregroundStyle(Theme.text)
            }
        }
        .frame(width: 32, height: 32)
        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.control))
    }

    @ViewBuilder
    private var action: some View {
        if process.isProtected {
            FrodoIcon(name: "lock", size: 15, color: Theme.Performance.muted)
                .padding(.horizontal, 8)
                .help("Processo do sistema: encerrar derruba a sessão")
        } else {
            IconButton(icon: "close", size: 32, iconSize: 14, tint: asking ? Theme.danger : Theme.text, help: "Encerrar \(name)", action: ask)
        }
    }

    private func value(_ column: ProcessSort) -> String {
        switch column {
        case .cpu: formatPercent(process.cpu)
        case .ram: formatBytes(Double(process.ramBytes))
        }
    }
}
