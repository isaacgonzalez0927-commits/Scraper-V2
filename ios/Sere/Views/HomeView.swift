import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var home: HomePayload?
    @State private var error = ""

    var body: some View {
        NavigationStack {
            List {
                if let home {
                    Section {
                        walletCard(home)
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)

                    Section {
                        moneyRow("Still owed", home.money.outstanding)
                        moneyRow("Overdue", home.money.overdue)
                        moneyRow("Profit this month", home.money.profitThisMonth)
                    }

                    if !home.today.isEmpty {
                        Section("Today") {
                            ForEach(home.today) { job in
                                NavigationLink {
                                    ShopWebView(path: "/jobs/\(job.id)", title: job.title)
                                } label: {
                                    jobRow(job)
                                }
                            }
                        }
                    }

                    if !home.finishedNotInvoiced.isEmpty {
                        Section("Finished, never billed") {
                            ForEach(home.finishedNotInvoiced) { job in
                                NavigationLink {
                                    ShopWebView(path: "/jobs/\(job.id)", title: job.title)
                                } label: {
                                    jobRow(job)
                                }
                            }
                        }
                    }

                    if !home.overdue.isEmpty {
                        Section("Overdue invoices") {
                            ForEach(home.overdue) { invoice in
                                NavigationLink {
                                    ShopWebView(path: "/invoices", title: invoice.number)
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack {
                                            Text(invoice.number).font(.headline)
                                            Spacer()
                                            Text(invoice.amount).font(.subheadline.monospacedDigit())
                                        }
                                        Text("\(invoice.customer) · due \(invoice.due)")
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                        StatusChip(text: invoice.status, tone: .red)
                                    }
                                    .padding(.vertical, 4)
                                }
                            }
                        }
                    }

                    if !home.followUps.isEmpty {
                        Section("Still open") {
                            ForEach(home.followUps, id: \.self) { row in
                                Text(row)
                            }
                        }
                    }
                } else if error.isEmpty {
                    Section {
                        HStack {
                            Spacer()
                            ProgressView("Opening the book…")
                            Spacer()
                        }
                        .padding(.vertical, 40)
                    }
                }

                if !error.isEmpty {
                    Section {
                        Text(error).foregroundStyle(.red).font(.footnote)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(session.shop?.name ?? "Sere")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        ShopWebView(path: "/jobs/new", title: "New")
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func walletCard(_ home: HomePayload) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Collected this month")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white.opacity(0.82))
            Text(home.money.collectedThisMonth)
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
            Text(home.headline)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(SereTheme.purple)
                .shadow(color: SereTheme.purple.opacity(0.28), radius: 16, y: 8)
        )
    }

    private func moneyRow(_ label: String, _ value: String) -> some View {
        LabeledContent(label) {
            Text(value).font(.body.monospacedDigit())
        }
    }

    private func jobRow(_ job: HomeJob) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(job.title).font(.headline)
                Spacer()
                Text(job.quoted).font(.subheadline.monospacedDigit())
            }
            Text("\(job.customer) · \(job.when)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            StatusChip(text: prettyStatus(job.status), tone: statusTone(job.status))
        }
        .padding(.vertical, 4)
    }

    private func load() async {
        do {
            home = try await APIClient.shared.home()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
    }
}
