import SwiftUI

struct JobsView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var rows: [JobRow] = []
    @State private var query = ""
    @State private var error = ""
    @State private var loaded = false

    private var filtered: [JobRow] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return rows }
        return rows.filter {
            $0.title.lowercased().contains(needle)
                || $0.customer.lowercased().contains(needle)
                || $0.statusLabel.lowercased().contains(needle)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(filtered) { row in
                    NavigationLink {
                        ShopWebView(path: row.href, title: row.title)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(row.title).font(.headline)
                                Spacer()
                                Text(row.amount).font(.subheadline.monospacedDigit())
                            }
                            Text("\(row.customer) · \(row.when)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            StatusChip(text: row.statusLabel, tone: statusTone(row.status))
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(session.shop?.jobsLabel ?? "Jobs")
            .searchable(text: $query, prompt: "Search \(session.shop?.jobsLabel.lowercased() ?? "jobs")")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        ShopWebView(path: "/jobs/new", title: "New")
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
                        "Nothing on the board",
                        systemImage: "briefcase",
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
    }

    private func load() async {
        do {
            rows = try await APIClient.shared.jobs()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }
}
