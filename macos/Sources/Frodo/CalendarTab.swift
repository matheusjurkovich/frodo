import FrodoCore
import FrodoPlatform
import SwiftUI

struct CalendarTab: View {
    let services: FrodoServices
    @State private var month = Date()
    @State private var selected = Date()

    var body: some View {
        let _ = services.revisions.calendar
        HStack(alignment: .top, spacing: 10) {
            monthCard.frame(width: 320)
            eventsCard
        }
        .task { if services.calendar.access == .unknown { await services.calendar.requestAccess() } }
    }

    private var calendar: Calendar { .current }

    private var monthCard: some View {
        CardView {
            HStack {
                Text(month.formatted(.dateTime.month(.wide).year()).sentenceCased).font(Theme.Font.title()).foregroundStyle(Theme.text)
                Spacer()
                IconButton(icon: "back", size: 28, iconSize: 12) { shift(-1) }
                IconButton(icon: "forward", size: 28, iconSize: 12) { shift(1) }
            }
            let days = grid()
            let withEvents = services.calendar.daysWithEvents(inMonthOf: month)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 2) {
                ForEach(["D", "S", "T", "Q", "Q", "S", "S"].indices, id: \.self) { index in
                    Text(["D", "S", "T", "Q", "Q", "S", "S"][index]).font(Theme.Font.label(.medium)).foregroundStyle(Theme.textSecondary).frame(height: 24)
                }
                ForEach(days.indices, id: \.self) { index in
                    dayCell(days[index], withEvents: withEvents)
                }
            }
        }
    }

    private func dayCell(_ date: Date?, withEvents: Set<Int>) -> some View {
        Group {
            if let date {
                let day = calendar.component(.day, from: date)
                let isSelected = calendar.isDate(date, inSameDayAs: selected)
                let isToday = calendar.isDateInToday(date)
                Button { withAnimation(Motion.standard) { selected = date } } label: {
                    VStack(spacing: 2) {
                        Text("\(day)").font(Theme.Font.secondary(.medium)).foregroundStyle(isSelected ? .white : Theme.text)
                        Circle().fill(withEvents.contains(day) ? (isSelected ? Color.white : Theme.accentText) : .clear).frame(width: 4, height: 4)
                    }
                    .frame(height: 38)
                    .frame(maxWidth: .infinity)
                    .background(Circle().fill(isSelected ? Theme.accent : .clear).frame(width: 36, height: 36))
                    .overlay(Circle().stroke(isToday && !isSelected ? Theme.accentText : .clear, lineWidth: 1.5).frame(width: 36, height: 36))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Color.clear.frame(height: 38)
            }
        }
    }

    private func grid() -> [Date?] {
        guard let interval = calendar.dateInterval(of: .month, for: month) else { return [] }
        let leading = calendar.component(.weekday, from: interval.start) - 1
        let count = calendar.range(of: .day, in: .month, for: month)?.count ?? 30
        return Array(repeating: nil, count: leading) + (0 ..< count).compactMap { calendar.date(byAdding: .day, value: $0, to: interval.start) }
    }

    private func shift(_ delta: Int) {
        if let next = calendar.date(byAdding: .month, value: delta, to: month) {
            withAnimation(Motion.standard) { month = next }
        }
    }

    private var eventsCard: some View {
        let events = services.calendar.events(on: selected)
        let title = (calendar.isDateInToday(selected) ? "Hoje · " : "") + selected.formatted(.dateTime.weekday(.wide).day().month(.wide)).sentenceCased
        return CardView(title: title) {
            switch services.calendar.access {
            case .denied:
                VStack(alignment: .leading, spacing: 8) {
                    Text("Sem acesso ao Calendário. Libere em Ajustes do Sistema para ver os eventos.").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
                    TextButton(title: "Abrir Ajustes", kind: .primary) { launchExternal { SystemActions.openSystemSettings(pane: "com.apple.preference.security?Privacy_Calendars") } }
                }
            case .unknown:
                TextButton(title: "Permitir acesso ao Calendário", kind: .primary) { Task { await services.calendar.requestAccess() } }
            case .granted:
                if events.isEmpty {
                    Text("Nenhuma reunião neste dia").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary).frame(maxWidth: .infinity, minHeight: 80)
                } else {
                    ForEach(events) { event in EventRow(event: event) }
                }
            }
        }
    }
}

private struct EventRow: View {
    let event: CalendarEvent

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            let past = event.end < context.date
            HStack(alignment: .top, spacing: 10) {
                Circle().fill(Color(hexString: event.colorHex)).frame(width: 8, height: 8).padding(.top, 6)
                VStack(alignment: .leading, spacing: 2) {
                    Text(event.isAllDay ? "Dia inteiro" : "\(event.start.formatted(.dateTime.hour().minute(.twoDigits))) – \(event.end.formatted(.dateTime.hour().minute(.twoDigits)))")
                        .font(Theme.Font.mono(12)).foregroundStyle(Theme.textSecondary)
                    Text(event.title).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text).lineLimit(2)
                    if !event.location.isEmpty { Text(event.location).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).lineLimit(1) }
                }
                Spacer(minLength: 8)
                if past {
                    Chip(text: "Encerrada")
                } else if event.start > context.date, event.start.timeIntervalSince(context.date) < 3600 {
                    Chip(text: formatUntil(event.start, now: context.date), tint: Theme.accentText)
                }
                if let url = event.meetingURL, !past {
                    TextButton(title: "Entrar", kind: .primary, compact: true) { launchExternal { SystemActions.open(url) } }
                }
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: Theme.Radius.item, style: .continuous).fill(Theme.cardInner))
            .opacity(past ? 0.6 : 1)
        }
    }
}

extension String {
    var sentenceCased: String {
        prefix(1).uppercased() + dropFirst()
    }
}
