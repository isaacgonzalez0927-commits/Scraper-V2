import SwiftUI

struct CustomersView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var rows: [CustomerRow] = []
    @State private var query = ""
    @State private var error = ""
    @State private var loaded = false

    private var filtered: [CustomerRow] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return rows }
        return rows.filter {
            $0.name.lowercased().contains(needle)
                || $0.phone.lowercased().contains(needle)
                || $0.email.lowercased().contains(needle)
        }
    }

    var body: some View {
        List {
            ForEach(filtered) { row in
                NavigationLink {
                    ShopWebView(path: row.href, title: row.name)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.name).font(.headline)
                        if !row.phone.isEmpty || !row.email.isEmpty {
                            Text([row.phone, row.email].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(session.shop?.customersLabel ?? "Customers")
        .searchable(text: $query, prompt: "Search \(session.shop?.customersLabel.lowercased() ?? "customers")")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    ShopWebView(path: "/customers/new", title: "New")
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .overlay {
            if !loaded && error.isEmpty {
                ProgressView()
            } else if rows.isEmpty && error.isEmpty {
                ContentUnavailableView(
                    "No customers yet",
                    systemImage: "person.2",
                    description: Text("Add the first one with the plus.")
                )
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(.red).padding() }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            rows = try await APIClient.shared.customers()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }
}
