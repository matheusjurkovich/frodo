import FrodoCore
import SwiftUI

struct NotificationsTab: View {
    let services: FrodoServices

    var body: some View {
        let _ = services.revisions.notifications
        let store = services.notifications
        CardView(
            title: "Notificações",
            trailing: AnyView(
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
            )
        ) {
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
            Text("O macOS não deixa um app ler as notificações dos outros. Aqui aparecem os avisos do Claude Code.")
                .font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
        }
    }
}

private struct NotificationRow: View {
    let item: NotificationItem
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(Theme.claude.opacity(0.2)).frame(width: 36, height: 36)
                FrodoIcon(name: "claude", size: 18, color: Theme.claude)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("\(item.app) · \(formatAgo(item.date, now: Date()))").font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                Text(item.title).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text)
                Text(item.body).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
            }
            Spacer()
            IconButton(icon: "close", size: 26, iconSize: 10, action: dismiss)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.item, style: .continuous).fill(Theme.cardInner))
    }
}
