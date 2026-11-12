import FrodoCore
import SwiftUI

struct NotificationsTab: View {
    let services: FrodoServices

    var body: some View {
        let _ = services.revisions.notifications
        let store = services.notifications
        CardView(title: "Notificações") {
            if store.items.isEmpty {
                Text("Tudo em dia").font(Theme.Font.body()).foregroundStyle(Theme.textSecondary).frame(maxWidth: .infinity, minHeight: 120)
            } else {
                VStack(spacing: 8) {
                    ForEach(store.items) { item in
                        NotificationRow(item: item) { withAnimation(Motion.standard) { store.dismiss(item.id) } }
                            .transition(.asymmetric(insertion: .opacity, removal: .move(edge: .trailing).combined(with: .opacity)))
                    }
                }
                .animation(Motion.standard, value: store.items.map(\.id))
            }
            Text("O macOS não deixa um app ler as notificações dos outros. Aqui aparecem os avisos do Frodo e dos assistentes.")
                .font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
        } trailing: {
            HStack(spacing: 8) {
                Button { store.doNotDisturb.toggle() } label: {
                    HStack(spacing: 6) {
                        FrodoIcon(name: store.doNotDisturb ? "bell-off" : "bell", size: 14, color: store.doNotDisturb ? .white : Theme.text)
                        Text("Não perturbe").font(Theme.Font.secondary(.medium)).foregroundStyle(store.doNotDisturb ? Color.white : Theme.text)
                    }
                    .padding(.horizontal, 12).frame(height: 30)
                    .background(Capsule().fill(store.doNotDisturb ? Theme.accent : Theme.control))
                }
                .buttonStyle(.plain)
                TextButton(title: "Limpar tudo", compact: true) { withAnimation(Motion.standard) { store.clearAll() } }
            }
        }
    }
}

private struct NotificationRow: View {
    let item: NotificationItem
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            NotificationBadge(provider: item.provider, size: 36, iconSize: 18)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(item.app) · \(formatAgo(item.date, now: Date()))").font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                Text(item.title).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text)
                Text(item.body).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
            }
            Spacer()
            IconButton(icon: "close", size: 26, iconSize: 10, action: dismiss)
        }
        .padding(10)
        .innerCard()
    }
}

struct NotificationBadge: View {
    let provider: AiProvider?
    let size: CGFloat
    let iconSize: CGFloat

    var body: some View {
        let color = provider.map { Theme.color(for: $0) } ?? Theme.accent
        ZStack {
            Circle().fill(color.opacity(0.2)).frame(width: size, height: size)
            if let provider {
                ProviderIcon(provider: provider, size: iconSize)
            } else {
                FrodoIcon(name: "bell", size: iconSize, color: color)
            }
        }
    }
}
