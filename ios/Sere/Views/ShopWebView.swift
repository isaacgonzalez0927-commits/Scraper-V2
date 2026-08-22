import SwiftUI
import WebKit

struct ShopWebView: View {
    let path: String
    let title: String

    var body: some View {
        WebView(url: APIClient.shared.webURL(path), token: APIClient.shared.token)
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
    }
}

private struct WebView: UIViewRepresentable {
    let url: URL
    let token: String?

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let view = WKWebView(frame: .zero, configuration: config)
        view.customUserAgent = SereConfig.userAgent
        view.allowsBackForwardNavigationGestures = true
        if let token, let cookie = cookie(token: token) {
            view.configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
        }
        view.load(authorizedRequest())
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    private func authorizedRequest() -> URLRequest {
        var request = URLRequest(url: url)
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.setValue(SereConfig.userAgent, forHTTPHeaderField: "User-Agent")
        return request
    }

    private func cookie(token: String) -> HTTPCookie? {
        var props: [HTTPCookiePropertyKey: Any] = [
            .domain: url.host ?? "www.sere.cash",
            .path: "/",
            .name: "sere_session",
            .value: token,
            .expires: Date().addingTimeInterval(60 * 60 * 24 * 30),
        ]
        if url.scheme == "https" {
            props[.secure] = "TRUE"
        }
        return HTTPCookie(properties: props)
    }
}
