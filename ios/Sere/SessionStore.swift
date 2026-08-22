import SwiftUI

@MainActor
final class SessionStore: ObservableObject {
    @Published var user: SessionUser?
    @Published var shop: SessionShop?
    @Published var error: String = ""
    @Published var busy = false

    var isSignedIn: Bool { user != nil && APIClient.shared.token != nil }

    init() {
        Task { await restore() }
    }

    func restore() async {
        guard APIClient.shared.token != nil else { return }
        do {
            let payload = try await APIClient.shared.session()
            user = payload.user
            shop = payload.shop
        } catch {
            user = nil
            shop = nil
        }
    }

    func signIn(email: String, password: String) async {
        error = ""
        busy = true
        defer { busy = false }
        do {
            let payload = try await APIClient.shared.login(email: email, password: password)
            user = payload.user
            shop = payload.shop
        } catch {
            self.error = error.localizedDescription
        }
    }

    func signOut() async {
        await APIClient.shared.logout()
        user = nil
        shop = nil
    }
}
