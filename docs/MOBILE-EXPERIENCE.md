# Sere mobile workspace

The mobile web experience uses the same Sere records, actions and payment integrations as desktop. The existing iOS wrapper loads this same responsive site.

At widths up to 900px:

- Today shows the next visit, completion progress, requests and operational counts. Collected payments, outstanding invoices and past-due amounts remain separately labeled. Monthly invoiced work and estimated profit are available under Monthly details.
- The fixed tabs are Today, Work, Collect, Serenity and More. Work opens dispatch; More keeps customers, the rest of the business screens, appearance and sign-out accessible. The floating setup guide collapses to a small corner pill above the tab bar and expands when tapped. Create opens a short menu of existing record forms.
- Both navigation menus and search use native modal dialogs for keyboard focus containment. Menus dismiss with Escape, their close control or a backdrop tap, and return focus to the opening control. The navigation sheet closes when returning to desktop width.
- Record lists use roomy cards with wrapping names and metadata. Requests show one stage at a time on a phone while the desktop retains the pipeline. Dispatch puts the selected day's agenda before the scheduling queue and moves summary metrics below it.
- Field capture keeps visit selection, customer contact, checklist, notes, time and photos together. Capture controls expose their selected state. Existing offline queue and sync behavior is unchanged.
- Collect separates invoice amounts from actions. Serenity keeps the composer above the bottom tabs and uses customer-facing connection status rather than model/tool details.
- The phone styles use existing light/dark theme tokens, safe-area insets and controls at least 44px high. Text uses relative sizes, and bottom clearance scales with the navigation's type size.

No database migration, new provider, or change to payment authorization is required. Desktop layout remains in the existing styles; phone-specific changes are in `app/mobile.css`.

Validation uses the existing test suite and production build. Browser, physical-device, keyboard and 200% text-enlargement acceptance testing still need to be performed; source review is not a substitute for those checks.
