# Sere for iPhone

Native SwiftUI app for the App Store. Home is a Wallet-style purple card with the cash that landed. Jobs and invoices are searchable lists, like Square. More is iOS Settings. Serenity is a native chat with a purple orb, like Messages. New records and longer forms open a slim in-app page of sere.cash.

The assistant is named **Serenity**. Old `/nova` links redirect there.

## Open it

1. On a Mac, install Xcode 16 or newer.
2. Open `ios/Sere.xcodeproj`.
3. Set the team under Signing & Capabilities (your Apple Developer account).
4. Pick an iPhone simulator or a device and press Run.

Sign in with a real Sere shop. Harbor Air works if you want the demo. The default host is `https://www.sere.cash`. Under Shop address you can point at a preview or `http://localhost:3000` while `next dev` is running.

## Put it on the App Store

1. Create the app in App Store Connect: name **Sere**, bundle id **cash.sere.app**, category Business.
2. In Xcode: Product → Archive, then Distribute App → App Store Connect.
3. Screenshots: Home, a job list, an invoice, and Serenity. Use a real shop, not placeholder latin.
4. Privacy: the app already ships `PrivacyInfo.xcprivacy`. In App Store Connect say you collect email for account login, not for tracking. Sere does not use advertising SDKs. The session token lives in the Keychain.
5. Review notes: this is the shop book. Card checkout stays on Stripe or Square. Restricted keys are pasted on the website, not in the iOS form.
6. Age rating: none of the high-risk categories apply. 4+ is the usual pick for a shop ledger.
7. Export compliance: Info.plist already sets `ITSAppUsesNonExemptEncryption` to false.

Apple will reject a blank website wrapper. This project is not that: native tabs, native lists, native Serenity. The web view is only for forms that already exist on the site.

## What you still need from Apple

A paid Apple Developer Program membership, a unique bundle id if `cash.sere.app` is taken, and a 1024px App Store screenshot set. The icon in this folder is the Sere mark on lavender.
