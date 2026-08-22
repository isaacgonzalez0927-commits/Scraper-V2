import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var email = ""
    @State private var password = ""
    @State private var host = SereConfig.defaultHost
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    VStack(spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(SereTheme.purple)
                                .frame(width: 76, height: 76)
                                .shadow(color: SereTheme.purple.opacity(0.35), radius: 16, y: 8)
                            Text("S")
                                .font(.system(size: 38, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                        }
                        Text("Sere")
                            .font(.largeTitle.weight(.bold))
                        Text("The book in your pocket. Jobs, invoices, and cash that actually landed.")
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 12)
                    }
                    .padding(.top, 36)

                    VStack(spacing: 0) {
                        field("Email", text: $email)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focused, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focused = .password }
                        Divider().padding(.leading, 16)
                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .focused($focused, equals: .password)
                            .submitLabel(.go)
                            .onSubmit { Task { await session.signIn(email: email, password: password) } }
                            .padding(16)
                    }
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                    if !session.error.isEmpty {
                        Text(session.error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        Task { await session.signIn(email: email, password: password) }
                    } label: {
                        Text(session.busy ? "Opening…" : "Open shop")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(SereTheme.purple)
                    .disabled(session.busy || email.isEmpty || password.isEmpty)

                    DisclosureGroup("Shop address") {
                        TextField("https://www.sere.cash", text: $host)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .textContentType(.URL)
                            .padding(.top, 8)
                            .onChange(of: host) { _, value in
                                APIClient.shared.setHost(value)
                            }
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
                .padding(24)
            }
            .background(SereTheme.paper.ignoresSafeArea())
            .scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear { host = APIClient.shared.host.absoluteString }
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text)
            .padding(16)
    }
}
