import SwiftUI

@main
struct SereApp: App {
    @StateObject private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if session.isSignedIn {
                    RootView()
                } else {
                    SignInView()
                }
            }
            .environmentObject(session)
            .tint(SereTheme.purple)
        }
    }
}
