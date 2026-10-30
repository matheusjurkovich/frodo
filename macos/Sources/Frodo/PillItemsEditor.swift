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
    @State private var selected: ClosedItem?

    private var settings: FrodoSettings { services.settings }

    var body: some View {
        let _ = services.revisions.settings
        let items = settings.closedItems
        VStack(alignment: .leading, spacing: 12) {
            if settings.closedMode == .minimal {
                note("No modo Mínimo a pílula mostra só o relógio. Escolha Compacto ou Rotativo para montar os itens.")
            } else {
                note("Itens, da esquerda para a direita")
                WrapLayout {
                    ForEach(Array(items.enumerated()), id: \.element) { index, item in chip(index: index, item: item) }
                }
                controls(items: items)
                addSection(items: items)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func note(_ text: String) -> some View {
        Text(text).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary).fixedSize(horizontal: false, vertical: true)
    }

    private func chip(index: Int, item: ClosedItem) -> some View {
        let isSelected = selected == item
        return Button {
            withAnimation(Motion.hover) { selected = isSelected ? nil : item }
        } label: {
            HStack(spacing: 8) {
                Text("\(index + 1)").font(Theme.Font.mono(11)).foregroundStyle(Theme.textSecondary)
                Text(item.label).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text)
            }
            .padding(.horizontal, 12)
            .frame(height: 32)
            .background(Capsule().fill(isSelected ? Theme.controlHover : Theme.control))
            .overlay(Capsule().stroke(isSelected ? Theme.accent : Color.clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func controls(items: [ClosedItem]) -> some View {
        if let item = selected, let index = items.firstIndex(of: item) {
            HStack(spacing: 8) {
                TextButton(title: "Mover para a esquerda", compact: true) { settings.closedItems = movingItem(items, item, by: -1) }
                    .disabled(index == 0)
                TextButton(title: "Mover para a direita", compact: true) { settings.closedItems = movingItem(items, item, by: 1) }
                    .disabled(index == items.count - 1)
                TextButton(title: "Tirar", kind: .danger, compact: true) {
                    settings.closedItems = removingItem(items, item)
                    selected = nil
                }
                .disabled(items.count < 2)
            }
        } else {
            note("Clique num item para movê-lo ou tirá-lo.")
        }
    }

    @ViewBuilder
    private func addSection(items: [ClosedItem]) -> some View {
        let missing = missingItems(items)
        if !missing.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                note("Adicionar")
                WrapLayout {
                    ForEach(missing, id: \.self) { item in
                        TextButton(title: "+ \(item.label)", compact: true) {
                            settings.closedItems = addingItem(items, item)
                            selected = item
                        }
                    }
                }
            }
        }
    }
}
