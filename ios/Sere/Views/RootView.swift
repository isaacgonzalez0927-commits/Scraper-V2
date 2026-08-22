import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house.fill") }
            JobsView()
                .tabItem { Label(session.shop?.jobsLabel ?? "Jobs", systemImage: "briefcase.fill") }
            InvoicesView()
                .tabItem { Label("Invoices", systemImage: "doc.text.fill") }
            SerenityView()
                .tabItem { Label("Serenity", systemImage: "sparkles") }
            MoreView()
                .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
        }
    }
}
