import FrodoPlatform
import SwiftUI

struct DevicePicker: View {
    let devices: [AudioDevice]
    let current: AudioDevice?
    let choose: (AudioDevice) -> Void
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Text("Dispositivo").font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                Button {
                    withAnimation(Motion.standard) { open.toggle() }
                } label: {
                    HStack(spacing: 8) {
                        Text(current?.name ?? "").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1).truncationMode(.tail)
                        Spacer(minLength: 0)
                        FrodoIcon(name: "expand", size: 12, color: Theme.textSecondary).rotationEffect(.degrees(open ? 180 : 0))
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .hoverBackground(radius: 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Dispositivo: \(current?.name ?? "")")
            }
            if open {
                VStack(spacing: 2) {
                    ForEach(devices, id: \.id) { item($0) }
                }
                .padding(4)
                .innerCard()
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private func item(_ device: AudioDevice) -> some View {
        Button {
            withAnimation(Motion.standard) { open = false }
            choose(device)
        } label: {
            HStack(spacing: 10) {
                Text(device.name).font(Theme.Font.secondary()).foregroundStyle(Theme.text).lineLimit(1).truncationMode(.tail)
                Spacer(minLength: 0)
                if device.id == current?.id {
                    Image(systemName: "checkmark").font(Theme.Font.label(.bold)).foregroundStyle(Theme.accentText)
                }
            }
            .padding(.horizontal, 10)
            .frame(height: 32)
            .hoverBackground(.clear, hover: Theme.controlHover, radius: 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
