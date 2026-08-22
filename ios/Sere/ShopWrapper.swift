import SwiftUI
import WebKit

enum SereConfig {
    static let start = URL(string: "https://www.sere.cash")!
    static let userAgent = "Sere-iOS/1.0"
}

struct ShopWrapper: View {
    @StateObject private var model = ShopModel()

    var body: some View {
        ZStack {
            WrapperWebView(model: model)
            if model.failed {
                VStack(spacing: 14) {
                    Text("Sere could not open.")
                        .font(.headline)
                    Text("Check the connection, then try again.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Try again") { model.reload() }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(red: 91 / 255, green: 56 / 255, blue: 214 / 255))
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(red: 247 / 255, green: 248 / 255, blue: 251 / 255))
            }
        }
    }
}

final class ShopModel: ObservableObject {
    @Published var failed = false
    weak var webView: WKWebView?

    func reload() {
        failed = false
        webView?.load(URLRequest(url: SereConfig.start))
    }
}

struct WrapperWebView: UIViewRepresentable {
    @ObservedObject var model: ShopModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        let view = WKWebView(frame: .zero, configuration: config)
        view.customUserAgent = SereConfig.userAgent
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.bounces = true
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        model.webView = view
        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh), for: .valueChanged)
        view.scrollView.refreshControl = refresh
        context.coordinator.webView = view
        view.load(URLRequest(url: SereConfig.start))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let model: ShopModel
        weak var webView: WKWebView?

        init(model: ShopModel) {
            self.model = model
        }

        @objc func refresh() {
            webView?.reload()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
            model.failed = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
            if !isCancelled(error) { model.failed = true }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
            if !isCancelled(error) { model.failed = true }
        }

        private func isCancelled(_ error: Error) -> Bool {
            (error as NSError).code == NSURLErrorCancelled
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            if shouldOpenOutside(url) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                if shouldOpenOutside(url) {
                    UIApplication.shared.open(url)
                } else {
                    webView.load(URLRequest(url: url))
                }
            }
            return nil
        }

        private func shouldOpenOutside(_ url: URL) -> Bool {
            let scheme = url.scheme?.lowercased() ?? ""
            if scheme == "tel" || scheme == "mailto" || scheme == "sms" { return true }
            guard let host = url.host?.lowercased() else { return false }
            if host == "sere.cash" || host.hasSuffix(".sere.cash") { return false }
            return scheme == "http" || scheme == "https"
        }
    }
}
