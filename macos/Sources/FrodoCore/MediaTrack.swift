public struct MediaTrack: Equatable, Sendable {
    public let title: String
    public let artist: String
    public let album: String
    public let coverUrl: String
    public let lengthMicroseconds: Int?
    public let app: String
    public let playing: Bool
    public let canPrevious: Bool
    public let canNext: Bool

    public init(
        title: String,
        artist: String,
        album: String = "",
        coverUrl: String = "",
        lengthMicroseconds: Int? = nil,
        app: String,
        playing: Bool = true,
        canPrevious: Bool = false,
        canNext: Bool = false
    ) {
        self.title = title
        self.artist = artist
        self.album = album
        self.coverUrl = coverUrl
        self.lengthMicroseconds = lengthMicroseconds
        self.app = app
        self.playing = playing
        self.canPrevious = canPrevious
        self.canNext = canNext
    }
}
