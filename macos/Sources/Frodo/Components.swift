import SwiftUI

struct HoverBackground: ViewModifier {
    let base: Color
    let hover: Color
    let radius: CGFloat
    @State private var hovering = false

    func body(content: Content) -> some View {
        content
            .background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(hovering ? hover : base))
            .onHover { hovering = $0 }
            .animation(Motion.hover, value: hovering)
    }
}

extension View {
    func hoverBackground(_ base: Color = Theme.control, hover: Color = Theme.controlHover, radius: CGFloat = Theme.Radius.item) -> some View {
        modifier(HoverBackground(base: base, hover: hover, radius: radius))
    }
}

struct CardView<Content: View>: View {
    var title: String?
    var trailing: AnyView?
    @ViewBuilder var content: Content

    init(title: String? = nil, trailing: AnyView? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.trailing = trailing
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if title != nil || trailing != nil {
                HStack {
                    if let title { Text(title).font(Theme.Font.title()).foregroundStyle(Theme.text) }
                    Spacer(minLength: 8)
                    if let trailing { trailing }
                }
            }
            content
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous).fill(Theme.card))
    }
}

struct IconButton: View {
    let icon: String
    var size: CGFloat = 36
    var iconSize: CGFloat = 16
    var tint: Color = Theme.text
    var help: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            FrodoIcon(name: icon, size: iconSize, color: tint)
                .frame(width: size, height: size)
                .hoverBackground(Theme.control, radius: size / 2)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .help(help ?? "")
    }
}

struct TextButton: View {
    enum Kind { case primary, secondary, danger }

    let title: String
    var kind: Kind = .secondary
    var compact = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Theme.Font.secondary(.medium))
                .foregroundStyle(kind == .primary ? Color.white : (kind == .danger ? Theme.danger : Theme.text))
                .padding(.horizontal, compact ? 10 : 14)
                .frame(height: compact ? 26 : 32)
                .hoverBackground(
                    kind == .primary ? Theme.accent : Theme.control, hover: kind == .primary ? Theme.accent.opacity(0.85) : Theme.controlHover,
                    radius: compact ? 13 : 16
                )
        }
        .buttonStyle(.plain)
    }
}

struct Chip: View {
    let text: String
    var tint: Color = Theme.textSecondary

    var body: some View {
        Text(text)
            .font(Theme.Font.label(.medium))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .frame(height: 20)
            .background(Capsule().fill(Theme.control))
    }
}

struct ProgressBar: View {
    let fraction: Double
    var tint: Color = Theme.claude
    var marker: Double?
    var height: CGFloat = 8

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.track)
                Capsule().fill(tint).frame(width: max(height, proxy.size.width * min(1, max(0, fraction))))
                if let marker {
                    Rectangle().fill(Theme.text.opacity(0.7)).frame(width: 2, height: height + 4)
                        .offset(x: proxy.size.width * min(1, max(0, marker)) - 1)
                }
            }
        }
        .frame(height: height)
        .animation(Motion.soft, value: fraction)
    }
}

struct SegmentedPicker<Value: Hashable>: View {
    let options: [(Value, String)]
    @Binding var selection: Value

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options.indices, id: \.self) { index in
                let option = options[index]
                Button {
                    withAnimation(Motion.standard) { selection = option.0 }
                } label: {
                    Text(option.1)
                        .font(Theme.Font.secondary(.medium))
                        .foregroundStyle(selection == option.0 ? Theme.text : Theme.textSecondary)
                        .padding(.horizontal, 12)
                        .frame(height: 26)
                        .background(Capsule().fill(selection == option.0 ? Theme.controlHover : .clear))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(Capsule().fill(Theme.control))
    }
}

struct StatusDot: View {
    let color: Color
    var size: CGFloat = 8

    var body: some View {
        Circle().fill(color).frame(width: size, height: size)
    }
}

struct ToggleRow: View {
    let title: String
    var subtitle: String?
    @Binding var isOn: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.Font.body()).foregroundStyle(Theme.text)
                if let subtitle { Text(subtitle).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary) }
            }
            Spacer()
            Toggle("", isOn: $isOn).toggleStyle(.switch).labelsHidden().tint(Theme.accent)
        }
    }
}
