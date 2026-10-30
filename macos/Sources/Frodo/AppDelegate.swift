import AppKit
import FrodoCore
import FrodoPlatform

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let arguments: [String]
    private var app: AppController?
    private var demo: DemoMode?

    init(arguments: [String]) {
        self.arguments = arguments
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if arguments.contains("--mic-check") {
            let volume = VolumeService()
            print("mic: pode silenciar \(volume.canMuteInput); antes \(volume.isInputMuted ? "mudo" : "ativo")")
            let muted = volume.setInputMuted(true)
            print("mic: silenciar \(muted ? "ok" : "falhou"), agora \(volume.isInputMuted ? "mudo" : "ativo")")
            let restored = volume.setInputMuted(false)
            print("mic: reativar \(restored ? "ok" : "falhou"), agora \(volume.isInputMuted ? "mudo" : "ativo")")
            fflush(stdout)
            exit(0)
        }
        if arguments.contains("--calendar-check") {
            runCalendarCheck()
            return
        }
        if arguments.contains("--scan") {
            runScan()
            return
        }
        if let index = arguments.firstIndex(of: "--icon"), arguments.indices.contains(index + 1) {
            Snapshots.writeIconSet(into: arguments[index + 1])
            exit(0)
        }
        if let index = arguments.firstIndex(of: "--snapshot"), arguments.indices.contains(index + 1) {
            Snapshots.run(into: arguments[index + 1])
            return
        }
        let isDemo = arguments.contains("--demo")
        let services: FrodoServices
        if isDemo {
            let mode = DemoMode()
            demo = mode
            services = mode.services
        } else {
            services = FrodoServices.live()
        }
        app = AppController(services: services)
        demo?.start()
        if arguments.contains("--smoke") { runSmoke() }
    }

    private func runCalendarCheck() {
        let calendar = CalendarService(settings: FrodoSettings(defaults: .standard), scheduler: SystemScheduler())
        Task { @MainActor in
            print("calendário antes: \(calendar.access)")
            await calendar.requestAccess()
            print("calendário depois: \(calendar.access), eventos hoje: \(calendar.events(on: Date()).count)")
            fflush(stdout)
            calendar.destroy()
            exit(0)
        }
    }

    private func runScan() {
        let services = FrodoServices.live()
        let started = Date()
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.5))
            await services.transcripts.scan()
            let summary = services.transcripts.index.summary(.month, now: Date())
            var usage = rusage()
            getrusage(RUSAGE_SELF, &usage)
            let peak = Int(usage.ru_maxrss) / 1_048_576
            print("frodo scan: \(formatTokens(summary.total)) tokens em 30 dias, \(summary.sessions) sessões, \(Int(Date().timeIntervalSince(started))) s, pico de memória \(peak) MB")
            fflush(stdout)
            services.destroy()
            exit(0)
        }
    }

    private func runSmoke() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, let app = self.app else { exit(1) }
            let panels = app.controllers.count
            let sessions = app.services.sessions.sessions.count
            print("frodo smoke: \(panels) ilha(s), \(sessions) sessão(ões), hook \(app.services.sessions.hooksInstalled() ? "ativo" : "não encontrado")")
            fflush(stdout)
            app.shutdown()
            exit(panels > 0 || NSScreen.screens.isEmpty ? 0 : 1)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        app?.shutdown()
    }
}
