import SwiftUI

struct MoreView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        Circle()
                            .fill(SereTheme.purple)
                            .frame(width: 52, height: 52)
                            .overlay {
                                Text(initials)
                                    .font(.headline)
                                    .foregroundStyle(.white)
                            }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.user?.name ?? "You")
                                .font(.headline)
                            Text(session.shop?.name ?? "Sere")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            if let trade = session.shop?.trade, !trade.isEmpty {
                                Text(trade)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 6)
                    LabeledContent("Mode", value: session.shop?.modeLabel ?? "")
                    LabeledContent("Plan", value: session.shop?.plan ?? "")
                }

                Section("The book") {
                    NavigationLink {
                        CustomersView()
                    } label: {
                        Label(session.shop?.customersLabel ?? "Customers", systemImage: "person.2")
                    }
                    NavigationLink {
                        ShopWebView(path: "/payments", title: "Payments")
                    } label: {
                        Label("Payments", systemImage: "creditcard")
                    }
                    NavigationLink {
                        ShopWebView(path: "/reports", title: "Reports")
                    } label: {
                        Label("Reports", systemImage: "chart.bar")
                    }
                    NavigationLink {
                        ShopWebView(path: "/settings", title: "Settings")
                    } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                }

                Section("Legal") {
                    NavigationLink {
                        ShopWebView(path: "/terms", title: "Terms")
                    } label: {
                        Label("Terms", systemImage: "doc.plaintext")
                    }
                    NavigationLink {
                        ShopWebView(path: "/privacy", title: "Privacy")
                    } label: {
                        Label("Privacy", systemImage: "hand.raised")
                    }
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        Task { await session.signOut() }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("More")
        }
    }

    private var initials: String {
        let name = session.user?.name ?? "S"
        let parts = name.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "S" : String(letters)
    }
}
