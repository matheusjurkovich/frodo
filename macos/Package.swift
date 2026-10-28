// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Frodo",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "FrodoCore"),
        .target(name: "FrodoPlatform", dependencies: ["FrodoCore"], swiftSettings: [.swiftLanguageMode(.v5), .enableUpcomingFeature("BareSlashRegexLiterals")]),
        .executableTarget(
            name: "Frodo",
            dependencies: ["FrodoCore", "FrodoPlatform"],
            swiftSettings: [.swiftLanguageMode(.v5), .enableUpcomingFeature("BareSlashRegexLiterals")]
        ),
        .testTarget(name: "FrodoCoreTests", dependencies: ["FrodoCore"]),
        .testTarget(name: "FrodoPlatformTests", dependencies: ["FrodoPlatform", "FrodoCore"]),
    ]
)
