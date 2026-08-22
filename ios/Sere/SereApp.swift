import SwiftUI

@main
struct SereApp: App {
    var body: some Scene {
        WindowGroup {
            ShopWrapper()
                .ignoresSafeArea()
        }
    }
}
