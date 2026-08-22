import SwiftUI

struct SerenityView: View {
    @State private var lines: [ChatLine] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var error = ""
    @State private var phase: OrbPhase = .idle
    @FocusState private var composerFocused: Bool

    private let prompts = [
        "What's on today",
        "Who owes me money",
        "What did I actually make this month",
        "Anything finished I never billed",
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VStack(spacing: 10) {
                    PurpleOrb(phase: phase)
                        .frame(width: 92, height: 92)
                    Text("Serenity")
                        .font(.title2.weight(.semibold))
                    Text("Ask about the board or the books. Numbers come from the shop, not guesses.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)
                }
                .padding(.top, 8)
                .padding(.bottom, 12)

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            if lines.isEmpty {
                                VStack(alignment: .leading, spacing: 10) {
                                    ForEach(prompts, id: \.self) { prompt in
                                        Button(prompt) { Task { await send(prompt) } }
                                            .buttonStyle(.bordered)
                                            .tint(SereTheme.purple)
                                            .disabled(busy)
                                    }
                                }
                                .padding(.top, 8)
                            }
                            ForEach(lines) { line in
                                HStack {
                                    if line.role == "you" { Spacer(minLength: 48) }
                                    Text(line.text.isEmpty ? "…" : line.text)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 10)
                                        .background(line.role == "you" ? SereTheme.purple : Color(.secondarySystemGroupedBackground))
                                        .foregroundStyle(line.role == "you" ? Color.white : Color.primary)
                                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                    if line.role != "you" { Spacer(minLength: 48) }
                                }
                                .id(line.id)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: lines.last?.text) { _, _ in
                        if let last = lines.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
                }

                if !error.isEmpty {
                    Text(error).font(.footnote).foregroundStyle(.red).padding(.horizontal)
                }

                HStack(alignment: .bottom, spacing: 8) {
                    TextField("Ask Serenity", text: $draft, axis: .vertical)
                        .textFieldStyle(.plain)
                        .lineLimit(1...5)
                        .padding(12)
                        .background(Color(.secondarySystemGroupedBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .focused($composerFocused)
                    Button {
                        Task { await send(draft) }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 34))
                            .foregroundStyle(
                                busy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    ? Color.secondary
                                    : SereTheme.purple
                            )
                    }
                    .disabled(busy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityLabel("Send")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.bar)
            }
            .background(SereTheme.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func send(_ message: String) async {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        error = ""
        busy = true
        phase = .thinking
        composerFocused = false
        lines.append(ChatLine(role: "you", text: text))
        lines.append(ChatLine(role: "serenity", text: ""))
        let index = lines.count - 1
        do {
            let reply = try await APIClient.shared.askSerenity(message: text) { partial in
                Task { @MainActor in
                    if lines.indices.contains(index) {
                        lines[index].text = partial
                    }
                }
            }
            if lines.indices.contains(index) {
                lines[index].text = reply
            }
            phase = .idle
        } catch {
            self.error = error.localizedDescription
            lines.removeAll { $0.role == "serenity" && $0.text.isEmpty }
            phase = .idle
        }
        busy = false
    }
}
