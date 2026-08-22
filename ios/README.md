# Sere for iPhone

You do not need Xcode on your Mac to use Sere on an iPhone.

## Use it today (the link)

On the iPhone, open [sere.cash/iphone](https://www.sere.cash/iphone) and tap **Open Sere**. Same login as the computer.

To keep it on the home screen: Safari → Share → Add to Home Screen.

## App Store later (the wrapper)

`ios/Sere.xcodeproj` is a thin wrapper around `https://www.sere.cash`. It is one WebView, a splash, pull to refresh, and an error screen. Stripe, Square, phone, and mail links open outside the wrapper.

Apple still needs a paid Apple Developer account and a Mac that can run a current Xcode to Archive and upload. An old Mac cannot do that step. When you are ready:

1. Use a newer Mac, a friend's Mac, or a rented cloud Mac.
2. Open `ios/Sere.xcodeproj`, set the team, Archive, upload to App Store Connect.
3. Put the App Store URL in `IPHONE_STORE_URL` in `lib/iphone.ts` so the iPhone page becomes the store link.

GitHub can compile the wrapper on a hosted Mac (`macos-14` in `.github/workflows/ios.yml`) so we know it builds. Uploading still needs your Apple signing.

## Review notes

This wrapper opens the shop the owner already uses in the browser. Card checkout stays on Stripe or Square. Restricted keys are pasted on the website, not in the iPhone shell.
