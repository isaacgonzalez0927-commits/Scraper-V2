import SwiftUI

enum OrbPhase {
    case idle, thinking
}

struct PurpleOrb: View {
    let phase: OrbPhase

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: false)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let spin = phase == .thinking ? t * 1.55 : t * 0.32
            Canvas { context, size in
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                let radius = min(size.width, size.height) * 0.38
                context.fill(
                    Path(ellipseIn: CGRect(
                        x: center.x - radius * 1.2,
                        y: center.y - radius * 1.2,
                        width: radius * 2.4,
                        height: radius * 2.4
                    )),
                    with: .color(SereTheme.purple.opacity(phase == .thinking ? 0.18 : 0.1))
                )
                for ring in 0 ..< 12 {
                    let tilt = Double(ring) / 11
                    let lat = (tilt - 0.5) * .pi
                    var path = Path()
                    for step in 0 ... 56 {
                        let a = Double(step) / 56 * .pi * 2 + spin
                        let x = cos(a) * cos(lat) * radius
                        let y = sin(lat) * radius
                        let z = sin(a) * cos(lat) * radius
                        let k = 1 / (1.75 - (z / radius) * 0.32)
                        let point = CGPoint(x: center.x + x * k, y: center.y + y * k)
                        if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
                    }
                    context.stroke(
                        path,
                        with: .color(SereTheme.purple.opacity(0.28 + tilt * 0.5)),
                        lineWidth: phase == .thinking ? 1.15 : 0.95
                    )
                }
            }
        }
        .clipShape(Circle())
        .accessibilityLabel("Serenity")
    }
}
