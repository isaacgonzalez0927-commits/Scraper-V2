import Foundation

enum APIError: LocalizedError {
    case message(String)
    case signedOut

    var errorDescription: String? {
        switch self {
        case .message(let text): return text
        case .signedOut: return "Sign in again."
        }
    }
}

final class APIClient {
    static let shared = APIClient()

    private let defaults = UserDefaults.standard
    private let tokenKey = "sere.session.token"
    private let hostKey = "sere.host"

    var host: URL {
        let raw = defaults.string(forKey: hostKey)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return URL(string: raw?.isEmpty == false ? raw! : SereConfig.defaultHost)!
    }

    func setHost(_ value: String) {
        defaults.set(value.trimmingCharacters(in: .whitespacesAndNewlines), forKey: hostKey)
    }

    var token: String? {
        if let stored = KeychainStore.get(account: tokenKey) { return stored }
        if let legacy = defaults.string(forKey: tokenKey) {
            KeychainStore.set(legacy, account: tokenKey)
            defaults.removeObject(forKey: tokenKey)
            return legacy
        }
        return nil
    }

    func setToken(_ value: String?) {
        if let value, !value.isEmpty {
            KeychainStore.set(value, account: tokenKey)
        } else {
            KeychainStore.delete(account: tokenKey)
        }
        defaults.removeObject(forKey: tokenKey)
    }

    func login(email: String, password: String) async throws -> SessionPayload {
        let payload = try await post(
            path: "/api/ios/login",
            body: ["email": email, "password": password],
            authorized: false,
            as: SessionPayload.self
        )
        if let token = payload.token {
            setToken(token)
        }
        return payload
    }

    func session() async throws -> SessionPayload {
        try await get(path: "/api/ios/login", as: SessionPayload.self)
    }

    func home() async throws -> HomePayload {
        try await get(path: "/api/ios/home", as: HomePayload.self)
    }

    func jobs() async throws -> [JobRow] {
        try await get(path: "/api/ios/jobs", as: JobsWrap.self).jobs
    }

    func invoices() async throws -> [InvoiceRow] {
        try await get(path: "/api/ios/invoices", as: InvoicesWrap.self).invoices
    }

    func customers() async throws -> [CustomerRow] {
        try await get(path: "/api/ios/customers", as: CustomersWrap.self).customers
    }

    func logout() async {
        _ = try? await post(path: "/api/ios/logout", body: [:], as: OK.self)
        setToken(nil)
    }

    func askSerenity(message: String, onDelta: @escaping (String) -> Void) async throws -> String {
        var request = try authorizedRequest(path: "/api/nova/chat", method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["message": message])
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw APIError.message("Serenity is not answering.")
        }
        var buffer = ""
        var streamed = ""
        var finalText = ""
        for try await line in bytes.lines {
            if line.isEmpty {
                let kind = firstMatch("event:\\s*(\\w+)", in: buffer)
                let raw = firstMatch("data:\\s*(.*)", in: buffer)
                buffer = ""
                guard let kind, let raw, let data = raw.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { continue }
                if kind == "delta", let delta = json["delta"] as? String {
                    streamed += delta
                    onDelta(streamed)
                } else if kind == "done" {
                    finalText = (json["reply"] as? String) ?? streamed
                } else if kind == "error" {
                    throw APIError.message((json["error"] as? String) ?? "Serenity hit a problem.")
                }
                continue
            }
            buffer += (buffer.isEmpty ? "" : "\n") + line
        }
        return finalText.isEmpty ? streamed : finalText
    }

    func webURL(_ path: String) -> URL {
        host.appending(path: path.hasPrefix("/") ? String(path.dropFirst()) : path)
    }

    private struct JobsWrap: Codable { let jobs: [JobRow] }
    private struct InvoicesWrap: Codable { let invoices: [InvoiceRow] }
    private struct CustomersWrap: Codable { let customers: [CustomerRow] }
    private struct OK: Codable { let ok: Bool? }

    private func get<T: Decodable>(path: String, as type: T.Type) async throws -> T {
        let request = try authorizedRequest(path: path, method: "GET")
        return try await decode(request, as: type)
    }

    private func post<T: Decodable>(
        path: String,
        body: [String: Any],
        authorized: Bool = true,
        as type: T.Type
    ) async throws -> T {
        var request = try authorizedRequest(path: path, method: "POST", authorized: authorized)
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await decode(request, as: type)
    }

    private func authorizedRequest(path: String, method: String, authorized: Bool = true) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: host) else {
            throw APIError.message("Bad address.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(SereConfig.userAgent, forHTTPHeaderField: "User-Agent")
        if authorized {
            guard let token else { throw APIError.signedOut }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func decode<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        let http = response as? HTTPURLResponse
        if http?.statusCode == 401 { throw APIError.signedOut }
        if let error = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String,
           http?.statusCode ?? 500 >= 400
        {
            throw APIError.message(error)
        }
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw APIError.message("The shop did not return a usable reply.")
        }
    }

    private func firstMatch(_ pattern: String, in text: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        guard let match = regex.firstMatch(in: text, range: range),
              let inner = Range(match.range(at: 1), in: text)
        else { return nil }
        return String(text[inner])
    }
}
