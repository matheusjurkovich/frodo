import FrodoCore
import SwiftUI

struct PillPreview: View {
    let services: FrodoServices

    var body: some View {
        PillContent(services: services, activity: nil)
            .background(Capsule().fill(Theme.island))
            .overlay(Capsule().stroke(Theme.islandBorder, lineWidth: 1))
            .allowsHitTesting(false)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
    }
}

struct PillItemsEditor: View {
    let services: FrodoServices

    private var settings: FrodoSettings { services.settings }

    var body: some View {
        let _ = services.revisions.settings
        let items = settings.closedItems
        VStack(alignment: .leading, spacing: 12) {
            if settings.closedMode == .minimal {
                note("No modo Mínimo a pílula mostra só o relógio. Escolha Compacto ou Rotativo para montar os itens.")
            } else {
                note("Itens, da esquerda para a direita")
                ReorderableList(items: items, axis: .horizontal, onMove: { settings.closedItems = $0 }) { item in
                    Text(item.label).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text)
                    IconButton(icon: "close", size: 22, iconSize: 10, tint: Theme.textSecondary, help: "Tirar \(item.label) da pílula") {
                        settings.closedItems = removingItem(items, item)
                    }
                    .disabled(items.count < 2)
                    .opacity(items.count < 2 ? 0.4 : 1)
                }
                note("Arraste os itens pela alça ou use as setas para mudar a ordem. Pelo teclado, foque a alça e use ← →.")
                addSection(items: items)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func note(_ text: String) -> some View {
        Text(text).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary).fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private func addSection(items: [ClosedItem]) -> some View {
        let missing = missingItems(items, providerEnabled: { settings.providerEnabled($0) })
        if !missing.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                note("Adicionar")
                WrapLayout {
                    ForEach(missing, id: \.self) { item in
                        TextButton(title: "+ \(item.label)", compact: true) {
                            settings.closedItems = addingItem(items, item)
                        }
                    }
                }
            }
        }
    }
}
