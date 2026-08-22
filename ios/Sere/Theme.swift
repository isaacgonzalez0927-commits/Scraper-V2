import SwiftUI

enum SereTheme {
    static let purple = Color(red: 91 / 255, green: 56 / 255, blue: 214 / 255)
    static let ink = Color(red: 15 / 255, green: 27 / 255, blue: 51 / 255)
    static let paper = Color(red: 247 / 255, green: 248 / 255, blue: 251 / 255)
}

enum SereConfig {
    static let defaultHost = "https://www.sere.cash"
    static let userAgent = "Sere-iOS/1.0"
}

struct StatusChip: View {
    let text: String
    var tone: Tone = .purple

    enum Tone {
        case purple, red, orange, green, gray
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(background)
            .clipShape(Capsule())
    }

    private var foreground: Color {
        switch tone {
        case .purple: return SereTheme.purple
        case .red: return .red
        case .orange: return .orange
        case .green: return .green
        case .gray: return .secondary
        }
    }

    private var background: Color {
        foreground.opacity(0.12)
    }
}

func prettyStatus(_ status: String) -> String {
    status.replacingOccurrences(of: "_", with: " ")
}

func statusTone(_ status: String) -> StatusChip.Tone {
    switch status {
    case "overdue": return .red
    case "sent", "viewed", "partial", "scheduled": return .orange
    case "paid", "completed": return .green
    case "draft", "unscheduled": return .gray
    default: return .purple
    }
}
