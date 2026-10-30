import FrodoCore
import Observation
import SwiftUI

@Observable
final class Surface {
    static let shared = Surface()

    var style = SurfaceStyle.solid
}

private struct GlassEnabledKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var glassEnabled: Bool {
        get { self[GlassEnabledKey.self] }
        set { self[GlassEnabledKey.self] = newValue }
    }
}
