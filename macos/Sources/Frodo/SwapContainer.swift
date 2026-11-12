import SwiftUI

struct SwapContainer<Key: Hashable, Content: View>: View {
    let key: Key
    let index: Int
    let axis: Axis
    let content: Content
    @State private var previousIndex: Int
    @State private var height: CGFloat = 0

    init(key: Key, index: Int, axis: Axis = .horizontal, @ViewBuilder content: () -> Content) {
        self.key = key
        self.index = index
        self.axis = axis
        self.content = content()
        _previousIndex = State(initialValue: index)
    }

    var body: some View {
        let direction: CGFloat = index >= previousIndex ? 1 : -1
        let distance = direction * Motion.swapOffset
        ZStack(alignment: .topLeading) {
            content
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .fixedSize(horizontal: false, vertical: true)
                .background(GeometryReader { proxy in
                    Color.clear.onChange(of: proxy.size.height, initial: true) { _, measured in
                        if measured > 0, abs(height - measured) > 0.5 { height = measured }
                    }
                })
                .id(key)
                .transition(.asymmetric(
                    insertion: .offset(x: axis == .horizontal ? distance : 0, y: axis == .vertical ? distance : 0)
                        .combined(with: .opacity.animation(Motion.swapFade)),
                    removal: .identity
                ))
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .frame(height: height > 0 ? height : nil, alignment: .top)
        .clipped()
        .animation(Motion.standard, value: key)
        .animation(Motion.standard, value: height)
        .onChange(of: index) { _, next in previousIndex = next }
    }
}
