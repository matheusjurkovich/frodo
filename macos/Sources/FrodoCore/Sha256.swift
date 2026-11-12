import Foundation

private let roundConstants: [UInt32] = [
    0x428a_2f98, 0x7137_4491, 0xb5c0_fbcf, 0xe9b5_dba5, 0x3956_c25b, 0x59f1_11f1, 0x923f_82a4, 0xab1c_5ed5,
    0xd807_aa98, 0x1283_5b01, 0x2431_85be, 0x550c_7dc3, 0x72be_5d74, 0x80de_b1fe, 0x9bdc_06a7, 0xc19b_f174,
    0xe49b_69c1, 0xefbe_4786, 0x0fc1_9dc6, 0x240c_a1cc, 0x2de9_2c6f, 0x4a74_84aa, 0x5cb0_a9dc, 0x76f9_88da,
    0x983e_5152, 0xa831_c66d, 0xb003_27c8, 0xbf59_7fc7, 0xc6e0_0bf3, 0xd5a7_9147, 0x06ca_6351, 0x1429_2967,
    0x27b7_0a85, 0x2e1b_2138, 0x4d2c_6dfc, 0x5338_0d13, 0x650a_7354, 0x766a_0abb, 0x81c2_c92e, 0x9272_2c85,
    0xa2bf_e8a1, 0xa81a_664b, 0xc24b_8b70, 0xc76c_51a3, 0xd192_e819, 0xd699_0624, 0xf40e_3585, 0x106a_a070,
    0x19a4_c116, 0x1e37_6c08, 0x2748_774c, 0x34b0_bcb5, 0x391c_0cb3, 0x4ed8_aa4a, 0x5b9c_ca4f, 0x682e_6ff3,
    0x748f_82ee, 0x78a5_636f, 0x84c8_7814, 0x8cc7_0208, 0x90be_fffa, 0xa450_6ceb, 0xbef9_a3f7, 0xc671_78f2,
]

private func rotatedRight(_ value: UInt32, _ bits: UInt32) -> UInt32 {
    (value >> bits) | (value << (32 - bits))
}

private func compress(_ state: inout [UInt32], _ block: ArraySlice<UInt8>) {
    var words = [UInt32](repeating: 0, count: 64)
    let start = block.startIndex
    for index in 0..<16 {
        let offset = start + index * 4
        words[index] = UInt32(block[offset]) << 24 | UInt32(block[offset + 1]) << 16 | UInt32(block[offset + 2]) << 8 | UInt32(block[offset + 3])
    }
    for index in 16..<64 {
        let first = words[index - 15]
        let second = words[index - 2]
        let small0 = rotatedRight(first, 7) ^ rotatedRight(first, 18) ^ (first >> 3)
        let small1 = rotatedRight(second, 17) ^ rotatedRight(second, 19) ^ (second >> 10)
        words[index] = words[index - 16] &+ small0 &+ words[index - 7] &+ small1
    }
    var a = state[0], b = state[1], c = state[2], d = state[3]
    var e = state[4], f = state[5], g = state[6], h = state[7]
    for index in 0..<64 {
        let big1 = rotatedRight(e, 6) ^ rotatedRight(e, 11) ^ rotatedRight(e, 25)
        let choice = (e & f) ^ (~e & g)
        let first = h &+ big1 &+ choice &+ roundConstants[index] &+ words[index]
        let big0 = rotatedRight(a, 2) ^ rotatedRight(a, 13) ^ rotatedRight(a, 22)
        let majority = (a & b) ^ (a & c) ^ (b & c)
        let second = big0 &+ majority
        h = g
        g = f
        f = e
        e = d &+ first
        d = c
        c = b
        b = a
        a = first &+ second
    }
    for (index, value) in [a, b, c, d, e, f, g, h].enumerated() { state[index] = state[index] &+ value }
}

public func sha256Hex(_ text: String) -> String {
    var bytes = Array(text.utf8)
    let bitLength = UInt64(bytes.count) * 8
    bytes.append(0x80)
    while bytes.count % 64 != 56 { bytes.append(0) }
    for shift in stride(from: 56, through: 0, by: -8) { bytes.append(UInt8(truncatingIfNeeded: bitLength >> UInt64(shift))) }
    var state: [UInt32] = [
        0x6a09_e667, 0xbb67_ae85, 0x3c6e_f372, 0xa54f_f53a, 0x510e_527f, 0x9b05_688c, 0x1f83_d9ab, 0x5be0_cd19,
    ]
    for start in stride(from: 0, to: bytes.count, by: 64) { compress(&state, bytes[start..<start + 64]) }
    return state.map { word in
        let hex = String(word, radix: 16)
        return String(repeating: "0", count: 8 - hex.count) + hex
    }.joined()
}
