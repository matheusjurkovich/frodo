import FrodoCore
import FrodoPlatform
import SwiftUI

private let idleFooter = "Atualiza a cada 2 s enquanto esta aba está aberta."

private enum Footer: Equatable {
    case idle
    case killed(String)
    case failed(String)

    var text: String {
        switch self {
        case .idle: idleFooter
        case .killed(let text), .failed(let text): text
        }
    }

    var color: Color {
        switch self {
        case .idle: Theme.textSecondary
        case .killed: Theme.ok
        case .failed: Theme.danger
        }
    }
}

struct ProcessTable: View {
    let services: FrodoServices
    @State private var sort: ProcessSort = .cpu
    @State private var asking: Int32?
    @State private var frozen: [ProcessUsage] = []
    @State private var footer: Footer = .idle

    var body: some View {
        let _ = services.revisions.performance
        let _ = services.revisions.apps
        let loading = services.performance.snapshot == nil
        let rows = asking == nil ? (loading ? [] : services.performance.top(sort: sort)) : frozen
        let highest = max(1e-9, rows.map { value($0) }.max() ?? 0)
        CardView(title: "Processos que mais gastam") {
            VStack(spacing: 0) {
                header
                if loading {
                    Text("Lendo o uso do sistema…").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary).padding(.vertical, 6)
                }
                ForEach(rows, id: \.pid) { process in
                    let app = services.apps.apps.first { $0.id == process.pid }
                    let name = app?.name ?? process.name
                    ProcessRow(
                        process: process, name: name, icon: app?.icon, share: value(process) / highest, sort: sort, asking: asking == process.pid
                    ) { toggleAsk(process, rows: rows) }
                    if asking == process.pid {
                        ProcessConfirm(name: name) { asking = nil } confirm: { terminate(process, name: name) }
                    }
                }
            }
            Text(footer.text).font(Theme.Font.label()).foregroundStyle(footer.color).padding(.top, 4)
        } trailing: {
            HStack(spacing: 12) {
                Text("Ordenar por").font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                SegmentedPicker(options: ProcessSort.allCases.map { ($0, $0.label) }, selection: $sort)
                TextButton(title: "Abrir Monitor de Atividade", compact: true) { launchExternal { SystemActions.openActivityMonitor() } }
            }
        }
        .onChange(of: sort) { asking = nil }
        .onDisappear {
            asking = nil
            footer = .idle
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text("Processo").frame(maxWidth: .infinity, alignment: .leading)
            ForEach(ProcessSort.allCases, id: \.self) { column in
                Text(column == sort ? "\(column.label) ↓" : column.label)
                    .foregroundStyle(column == sort ? Theme.text : Theme.textSecondary)
                    .frame(width: 84, alignment: .trailing)
            }
            Text("Ações").frame(width: 48, alignment: .trailing)
        }
        .font(Theme.Font.label())
        .foregroundStyle(Theme.textSecondary)
        .padding(.vertical, 6)
    }

    private func value(_ process: ProcessUsage) -> Double {
        sort == .cpu ? process.cpu : Double(process.ramBytes)
    }

    private func toggleAsk(_ process: ProcessUsage, rows: [ProcessUsage]) {
        if asking == process.pid {
            asking = nil
            return
        }
        frozen = rows
        asking = process.pid
    }

    private func terminate(_ process: ProcessUsage, name: String) {
        asking = nil
        footer = services.performance.terminate(pid: process.pid) ? .killed("\(name) (pid \(process.pid)) foi encerrado.") : .failed("Não deu para encerrar \(name).")
    }
}

private struct ProcessConfirm: View {
    let name: String
    let cancel: () -> Void
    let confirm: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text("Encerrar \(name)? O que não foi salvo nele pode se perder.")
                .font(Theme.Font.secondary())
                .foregroundStyle(Theme.Performance.confirmText)
                .frame(maxWidth: .infinity, alignment: .leading)
            TextButton(title: "Cancelar", compact: true, action: cancel)
            TextButton(title: "Encerrar", kind: .destructive, compact: true, action: confirm)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.item, style: .continuous).fill(Theme.Performance.confirmBackground))
    }
}
