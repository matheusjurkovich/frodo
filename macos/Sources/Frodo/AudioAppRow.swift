import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

struct AudioAppRow: View {
    let process: AudioProcess
    let state: String

    var body: some View {
        let app = NSRunningApplication(processIdentifier: process.pid)
        let name = app?.localizedName ?? process.bundleId ?? "pid \(process.pid)"
        HStack(spacing: 10) {
            Group {
                if let icon = app?.icon {
                    Image(nsImage: icon).resizable().frame(width: 20, height: 20)
                } else {
                    Text(monogram(name)).font(Theme.Font.label(.bold)).foregroundStyle(Theme.text)
                }
            }
            .frame(width: 32, height: 32)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.control))
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text).lineLimit(1).truncationMode(.tail)
                Text(state).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}
