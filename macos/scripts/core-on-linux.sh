set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
dir="${TMPDIR:-/tmp}/frodo-core-linux"

rm -rf "$dir/Sources" "$dir/Tests"
mkdir -p "$dir/Sources" "$dir/Tests"
cp -R "$root/Sources/FrodoCore" "$dir/Sources/FrodoCore"
cp -R "$root/Tests/FrodoCoreTests" "$dir/Tests/FrodoCoreTests"
find "$dir/Sources" "$dir/Tests" -name '*.swift' -exec sed -i.bak 's/^import CoreGraphics$/import Foundation/' {} +
find "$dir/Sources" "$dir/Tests" -name '*.bak' -delete

cat > "$dir/Package.swift" <<'PKG'
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "FrodoCoreLinux",
    targets: [
        .target(name: "FrodoCore"),
        .testTarget(name: "FrodoCoreTests", dependencies: ["FrodoCore"]),
    ]
)
PKG

if [ $# -gt 0 ]; then
    exec docker run --rm -v "$dir:/pkg" -w /pkg swift:6.1-jammy swift test --filter "$1"
fi
exec docker run --rm -v "$dir:/pkg" -w /pkg swift:6.1-jammy swift test
