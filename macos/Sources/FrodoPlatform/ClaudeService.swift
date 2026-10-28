import FrodoCore
import Foundation

private let minRefresh: TimeInterval = 60

private func capture<Value: Sendable>(_ work: @Sendable () async throws -> Value) async -> Result<Value, Error> {
    do {
        return .success(try await work())
    } catch {
        return .failure(error)
    }
}

@MainActor
public final class ClaudeService: Destroyable {
    public let changed = Event<Void>()

    private struct Entry {
        let client: ClaudeClient
        var usage: ProfileUsage
    }

    private let settings: FrodoSettings
    private let store: any CredentialStore
    private let transport: Transport
    private let paths: FrodoPaths
    private let now: @Sendable () -> Date
    private let timer: TimerSlot
    private let disposables = Disposables()
    private var entries: [Entry] = []
    private var lastRefresh: Date?
    private var destroyed = false
    public private(set) var lastFailed = false

    public init(
        settings: FrodoSettings, store: any CredentialStore, transport: @escaping Transport, paths: FrodoPaths, scheduler: Scheduler,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.settings = settings
        self.store = store
        self.transport = transport
        self.paths = paths
        self.now = now
        timer = TimerSlot(scheduler: scheduler)
        disposables.add(settings.onChanged(["claude-poll-minutes"]) { [weak self] in self?.schedule() })
        disposables.add(settings.onChanged(["claude-profiles"]) { [weak self] in
            guard let self else { return }
            self.rebuild(self.settings.claudeProfiles)
        })
        schedule()
        Task { [weak self] in
            guard let self else { return }
            let profiles = await ensureProfiles(settings: self.settings, store: self.store, paths: self.paths)
            if !self.destroyed { self.rebuild(profiles) }
        }
    }

    public var profiles: [ProfileUsage] {
        entries.map(\.usage)
    }

    public var active: ProfileUsage? {
        profiles.first(where: \.active) ?? profiles.first
    }

    public func refreshIfStale(maxAge: TimeInterval) {
        if lastRefresh.map({ now().timeIntervalSince($0) >= maxAge }) ?? true {
            Task { await refresh(force: true) }
        }
    }

    public func refresh(force: Bool = false) async {
        if !force, let lastRefresh, now().timeIntervalSince(lastRefresh) < minRefresh { return }
        lastRefresh = now()
        let snapshot = entries
        await withTaskGroup(of: (Int, ProfileUsage).self) { group in
            for (index, entry) in snapshot.enumerated() {
                group.addTask { (index, await Self.fetch(entry.client, current: entry.usage, now: self.now())) }
            }
            for await (index, usage) in group where !destroyed && index < entries.count && entries[index].usage.profile == usage.profile {
                entries[index].usage = usage
            }
        }
        if destroyed { return }
        lastFailed = !entries.isEmpty && entries.allSatisfy { $0.usage.status == .error }
        changed.emit()
    }

    private func rebuild(_ profiles: [ClaudeProfile]) {
        let defaultDir = paths.defaultClaudeConfigDir
        let hasActive = profiles.contains { isActiveProfile($0, defaultConfigDir: defaultDir) }
        entries = profiles.enumerated().map { index, profile in
            let active = hasActive ? isActiveProfile(profile, defaultConfigDir: defaultDir) : index == 0
            return Entry(
                client: ClaudeClient(configDir: profile.configDir, store: store, transport: transport, now: now),
                usage: ProfileUsage(profile: profile, active: active)
            )
        }
        changed.emit()
        Task { await refresh(force: true) }
    }

    private func schedule() {
        timer.every(TimeInterval(max(1, settings.claudePollMinutes)) * 60) { [weak self] in
            Task { await self?.refresh() }
        }
    }

    private static func fetch(_ client: ClaudeClient, current: ProfileUsage, now: Date) async -> ProfileUsage {
        var tier = current.tier
        let known = await client.readTier()
        if known.subscriptionType != nil || known.rateLimitTier != nil {
            tier = tierLabel(plan: known.subscriptionType, rateLimitTier: known.rateLimitTier)
        }
        async let usageResult = capture { try await client.fetchUsage() }
        async let profileResult = capture { try await client.fetchProfile() }
        let (usage, profile) = await (usageResult, profileResult)
        switch usage {
        case let .failure(error):
            return applyError(error, to: current, tier: tier)
        case let .success(value):
            let account = (try? profile.get()).flatMap { accountSummary($0) }
            return ProfileUsage(
                profile: current.profile, active: current.active, status: .ok, windows: normalizeWindows(value), spend: normalizeSpend(value),
                tier: account.map { tierLabel(plan: $0.plan, rateLimitTier: $0.rateLimitTier) } ?? tier, subtitle: account?.subtitle ?? current.subtitle,
                error: nil, updatedAt: now
            )
        }
    }

    private static func applyError(_ error: Error, to current: ProfileUsage, tier: String?) -> ProfileUsage {
        if error is SignedOutError {
            return ProfileUsage(
                profile: current.profile, active: current.active, status: .signedOut, tier: tier, subtitle: current.subtitle,
                error: "Sem login do Claude Code neste perfil.", updatedAt: current.updatedAt
            )
        }
        let apiError = error as? ClaudeApiError
        if apiError?.status == 429, current.status == .ok { return current }
        return ProfileUsage(
            profile: current.profile, active: current.active, status: .error, windows: current.windows, spend: current.spend, tier: tier,
            subtitle: current.subtitle, error: claudeErrorMessage(status: apiError?.status, apiMessage: apiError?.apiMessage), updatedAt: current.updatedAt
        )
    }

    public func destroy() {
        destroyed = true
        timer.stop()
        disposables.dispose()
        changed.clearListeners()
    }
}
