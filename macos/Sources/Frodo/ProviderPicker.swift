import FrodoCore
import SwiftUI

enum AiView: Hashable, Sendable {
    case all
    case provider(AiProvider)

    static let order: [AiView] = [.all] + AiProvider.allCases.map { .provider($0) }

    var index: Int {
        AiView.order.firstIndex(of: self) ?? 0
    }

    var label: String {
        switch self {
        case .all: "Todos"
        case let .provider(provider): provider.name
        }
    }

    func shown(enabled: [AiProvider]) -> AiView {
        if enabled.count == 1, let only = enabled.first { return .provider(only) }
        if case let .provider(provider) = self, !enabled.contains(provider) { return .all }
        return self
    }
}

struct ProviderPicker: View {
    let enabled: [AiProvider]
    @Binding var selection: AiView

    var body: some View {
        if enabled.count > 1 {
            SegmentedPicker(options: ([AiView.all] + enabled.map { AiView.provider($0) }).map { ($0, $0.label) }, selection: $selection)
        }
    }
}
