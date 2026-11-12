import FrodoCore
import SwiftUI

private let reorderSpace = "reorderable-list"

private struct ReorderFrameKey: PreferenceKey {
    static let defaultValue = CGRect.zero

    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        value = nextValue()
    }
}

private extension View {
    @MainActor
    func reportFrame(in space: String, _ onChange: @escaping @MainActor (CGRect) -> Void) -> some View {
        background(GeometryReader { proxy in Color.clear.preference(key: ReorderFrameKey.self, value: proxy.frame(in: .named(space))) })
            .onPreferenceChange(ReorderFrameKey.self) { frame in MainActor.assumeIsolated { onChange(frame) } }
    }
}

struct ReorderableList<Item: Hashable, Row: View>: View {
    private struct Drag {
        let item: Item
        let size: CGSize
        let grab: CGSize
        var location: CGPoint
        var target: Int
    }

    let items: [Item]
    let axis: Axis
    let onMove: ([Item]) -> Void
    let row: (Item) -> Row

    @State private var drag: Drag?
    @State private var frames: [Item: CGRect] = [:]
    @GestureState private var gestureActive = false
    @FocusState private var focused: Item?
    @Environment(IslandModel.self) private var island: IslandModel?

    init(items: [Item], axis: Axis, onMove: @escaping ([Item]) -> Void, @ViewBuilder row: @escaping (Item) -> Row) {
        self.items = items
        self.axis = axis
        self.onMove = onMove
        self.row = row
    }

    var body: some View {
        let shown = drag.map { moveTo(items, $0.item, $0.target) } ?? items
        stack {
            ForEach(Array(shown.enumerated()), id: \.element) { index, item in
                let lifted = drag?.item == item
                cell(item, index: index, interactive: true)
                    .opacity(lifted ? 0.3 : 1)
                    .reportFrame(in: reorderSpace) { frames[item] = $0 }
            }
        }
        .overlay(alignment: .topLeading) { floating }
        .coordinateSpace(.named(reorderSpace))
        .onChange(of: gestureActive) { _, active in
            if !active { finishDrag() }
        }
        .onDisappear {
            guard drag != nil else { return }
            drag = nil
            island?.dragging = false
        }
    }

    @ViewBuilder
    private func stack<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        if axis == .vertical {
            VStack(alignment: .leading, spacing: 0) { content() }
        } else {
            WrapLayout { content() }
        }
    }

    @ViewBuilder
    private var floating: some View {
        if let drag {
            cell(drag.item, index: drag.target, interactive: false)
                .frame(width: drag.size.width, height: drag.size.height)
                .background(RoundedRectangle(cornerRadius: Theme.Radius.item, style: .continuous).fill(Theme.controlHover))
                .shadow(color: Theme.shadow.opacity(0.3 * Theme.shadowStrength), radius: 8, y: 3)
                .offset(x: drag.location.x - drag.grab.width, y: drag.location.y - drag.grab.height)
                .allowsHitTesting(false)
        }
    }

    @ViewBuilder
    private func cell(_ item: Item, index: Int, interactive: Bool) -> some View {
        let content = HStack(spacing: 8) {
            handle(item, interactive: interactive)
            arrows(item)
            Text("\(index + 1)").font(Theme.Font.mono(11)).foregroundStyle(Theme.textSecondary)
            row(item)
        }
        if axis == .vertical {
            SettingBlock { content.frame(minHeight: 32) }
        } else {
            content
                .padding(.leading, 4)
                .padding(.trailing, 6)
                .frame(height: 32)
                .background(Capsule().fill(Theme.control))
        }
    }

    @ViewBuilder
    private func handle(_ item: Item, interactive: Bool) -> some View {
        let grip = FrodoIcon(name: "grip", size: 14, color: Theme.textSecondary)
            .frame(width: 24, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(interactive && focused == item ? Theme.accent : Color.clear, lineWidth: 1.5)
            )
            .contentShape(Rectangle())
        if interactive {
            grip
                .focusable(interactions: .edit)
                .focused($focused, equals: item)
                .focusEffectDisabled()
                .onKeyPress(keys: stepKeys) { press in
                    step(item, by: press.key == .upArrow || press.key == .leftArrow ? -1 : 1)
                }
                .onTapGesture { focused = item }
                .gesture(
                    DragGesture(minimumDistance: 3, coordinateSpace: .named(reorderSpace))
                        .updating($gestureActive) { _, active, _ in active = true }
                        .onChanged { value in dragChanged(item, value) }
                        .onEnded { _ in finishDrag() }
                )
                .help(axis == .vertical ? "Arraste ou use ↑ ↓" : "Arraste ou use ← →")
        } else {
            grip
        }
    }

    @ViewBuilder
    private func arrows(_ item: Item) -> some View {
        let index = items.firstIndex(of: item) ?? 0
        let vertical = axis == .vertical
        HStack(spacing: 2) {
            arrow(icon: vertical ? "collapse" : "back", help: vertical ? "Mover para cima" : "Mover para a esquerda", enabled: index > 0) {
                _ = step(item, by: -1)
            }
            arrow(icon: vertical ? "expand" : "forward", help: vertical ? "Mover para baixo" : "Mover para a direita", enabled: index < items.count - 1) {
                _ = step(item, by: 1)
            }
        }
    }

    private func arrow(icon: String, help: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        IconButton(icon: icon, size: 22, iconSize: 10, tint: Theme.textSecondary, help: help, action: action)
            .disabled(!enabled)
            .opacity(enabled ? 1 : 0.3)
    }

    private var stepKeys: Set<KeyEquivalent> {
        axis == .vertical ? [.upArrow, .downArrow] : [.leftArrow, .rightArrow]
    }

    private func step(_ item: Item, by offset: Int) -> KeyPress.Result {
        let next = movingItem(items, item, by: offset)
        guard next != items else { return .ignored }
        withAnimation(Motion.standard) { onMove(next) }
        return .handled
    }

    private func dragChanged(_ item: Item, _ value: DragGesture.Value) {
        if drag == nil {
            guard let frame = frames[item], let from = items.firstIndex(of: item) else { return }
            let grab = CGSize(width: value.startLocation.x - frame.minX, height: value.startLocation.y - frame.minY)
            drag = Drag(item: item, size: frame.size, grab: grab, location: value.location, target: from)
            focused = item
            island?.dragging = true
        }
        drag?.location = value.location
        let others = items.filter { $0 != item }.compactMap { frames[$0] }
        guard others.count == items.count - 1,
              let target = insertionIndex(others, at: value.location, horizontal: axis == .horizontal),
              target != drag?.target
        else { return }
        withAnimation(Motion.standard) { drag?.target = target }
    }

    private func finishDrag() {
        guard let drag else { return }
        let next = moveTo(items, drag.item, drag.target)
        withAnimation(Motion.standard) {
            self.drag = nil
            if next != items { onMove(next) }
        }
        island?.dragging = false
    }
}
