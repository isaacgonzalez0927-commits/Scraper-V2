import Foundation

struct SessionUser: Codable, Hashable {
    let id: Int
    let name: String
    let email: String
}

struct SessionShop: Codable, Hashable {
    let id: Int
    let name: String
    let trade: String
    let jobsLabel: String
    let customersLabel: String
    let mode: String
    let modeLabel: String
    let frozen: Bool
    let plan: String
}

struct SessionPayload: Codable {
    let token: String?
    let assistant: String?
    let user: SessionUser
    let shop: SessionShop
}

struct HomeMoney: Codable, Hashable {
    let collectedThisMonth: String
    let outstanding: String
    let overdue: String
    let profitThisMonth: String
}

struct HomeJob: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let customer: String
    let when: String
    let status: String
    let quoted: String
}

struct HomeInvoice: Codable, Identifiable, Hashable {
    let number: String
    let customer: String
    let amount: String
    let due: String
    let status: String
    var id: String { number }
}

struct HomePayload: Codable {
    let assistant: String?
    let shop: String
    let trade: String
    let headline: String
    let money: HomeMoney
    let today: [HomeJob]
    let overdue: [HomeInvoice]
    let finishedNotInvoiced: [HomeJob]
    let followUps: [String]
}

struct JobRow: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let customer: String
    let when: String
    let status: String
    let statusLabel: String
    let amount: String
    let href: String
}

struct InvoiceRow: Codable, Identifiable, Hashable {
    let id: Int
    let number: String
    let customer: String
    let issued: String
    let due: String
    let status: String
    let statusLabel: String
    let total: String
    let balance: String
    let href: String
}

struct CustomerRow: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let phone: String
    let email: String
    let href: String
}

struct ChatLine: Identifiable {
    let id = UUID()
    let role: String
    var text: String
}
