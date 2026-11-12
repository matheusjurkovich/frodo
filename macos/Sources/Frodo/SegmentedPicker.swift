import SwiftUI

struct SegmentedPicker<Value: Hashable>: View {
    let options: [(Value, String)]
    @Binding var selection: Value
    @Environment(\.isEnabled) private var isEnabled
    @Namespace private var markerSpace

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options.indices, id: \.self) { index in
                let option = options[index]
                let selected = selection == option.0
                Button {
                    withAnimation(Motion.standard) { selection = option.0 }
                } label: {
                    Text(option.1)
                        .font(Theme.Font.secondary(.medium))
                        .foregroundStyle(selected ? Theme.text : Theme.textSecondary)
                        .padding(.horizontal, 12)
                        .frame(height: 26)
                        .background {
                            if selected { Capsule().fill(Theme.controlHover).matchedGeometryEffect(id: "marker", in: markerSpace) }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(Capsule().fill(Theme.control))
        .opacity(isEnabled ? 1 : 0.4)
    }
}
