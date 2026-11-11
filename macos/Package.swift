// swift-tools-version: 6.0
import PackageDescription

let appSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v5),
    .enableUpcomingFeature("BareSlashRegexLiterals"),
    .enableUpcomingFeature("StrictConcurrency"),
]

let package = Package(
    name: "Frodo",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "FrodoCore"),
        .target(name: "FrodoPlatform", dependencies: ["FrodoCore"], swiftSettings: appSettings),
        .executableTarget(name: "Frodo", dependencies: ["FrodoCore", "FrodoPlatform"], swiftSettings: appSettings),
        .testTarget(name: "FrodoCoreTests", dependencies: ["FrodoCore"]),
        .testTarget(name: "FrodoPlatformTests", dependencies: ["FrodoPlatform", "FrodoCore"]),
    ]
)
