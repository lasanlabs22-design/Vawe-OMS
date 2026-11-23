# Decisions and assumptions

The OMS was built before every question to the client was answered. Where an answer was missing, the default below was used. Each one can be changed, and the "Where" column says where.

## Access and sign-in

| Question | Default used | Where |
| --- | --- | --- |
| What "verified login" means | Password with lockout (5 tries, 15 minutes), forced change of temporary passwords, server-side sessions. **No one-time codes yet:** email codes can be added once Resend is set up | `apps/api/src/routes/auth.ts` |
| Who uses ops | Admins only | `authRoutes("ops")` |
| Same account for ops and app | Yes. One account, separate sessions | `apps/api/src/lib/sessions.ts` |
| Access granularity | None / view / edit per module (Sales, Vendors, Orders, Finance). Inventory is view for all, edit for admins only | `packages/shared/src/access.ts` |
| Production-step permissions for factory staff | Not separate: anyone with Orders edit can move stages | Order stage endpoint |
| Forgotten password | An admin resets it in ops (temporary password, shown once) | Ops → People |
| Who changes a sign-in email | Admins, in ops. People can't change their own | Ops → Edit person |

## Orders and DWG

| Question | Default used |
| --- | --- |
| DWG | The drawing and job card the OMS generates from the items (confirmed by the client). Printed or saved as PDF from the browser |
| Stages | Design → Q/A → DWG confirmation → Estimate confirmation → Payment/advance → Cutting → Drilling → Hinge holes → Glass cutting → Assembly → Packaging → Dispatched → Delivered (+ Cancelled) |
| Moving between stages | Any stage can be set, forwards or back. Every move is recorded with who and when |
| Procurement hold | A flag on the order at any stage before dispatch. The stage stays the same; a held order can't move forward within production until it's released |
| Stages per order or per item | Per order |
| Editing | Details can change any time. Items and vendor only before production; the estimate is then recalculated |
| Expected delivery | The workbook's rule (2 working days after the order date, Sundays off) unless set on the order |
| Order code | `VW-YYMM-0001`, numbered per month |
| Item quantity | "No. of shutters" |
| Order value in reports | Before GST, cancelled orders excluded |

## Pricing

The estimate rebuilds the workbook's formulas (`packages/shared/src/pricing.ts`, with tests).

**Two workbook bugs are fixed:**
- Profile Shutter pricing never ran, because the code checked for "Profile Shutters" (plural).
- The first item's type priced the whole order. Now every item is priced by its own type.

**Assumptions to confirm:**
- **1 sq ft per group:** an extra 1 sq ft is added per group of matching items (frame + handle + glass), as in the workbook. It also counts in the glass area for RFT vendors.
- **Glass with no shutter rate:** a profile shutter with lacquered, digital print, cane or laminate glass has no rate in the workbook. It's priced at that glass's FTC rate.
- **5% discount flag:** becomes a per-vendor discount %, applied to the subtotal before GST.
- **"FD" delivery:** stored as text on the vendor. It isn't charged in the estimate because its meaning is still unconfirmed.
- **6-inch glass rounding:** one vendor's 6-inch rounding remark isn't applied automatically. It's kept as a remark.
- **GST:** 18%, shown separately.
- **Walk-ins and missing rates:** walk-in customers and any rate a vendor lacks use the **default price list**. The import sets it to the most common workbook rates; admins edit it in Settings → Catalogue & prices.
- **Who changes prices:** only admins change prices and discounts.

## Vendors

| Question | Default used |
| --- | --- |
| Vendors | B2B buyers who pay Vawe. Suppliers are only names on purchases |
| Vendor ID | `VND-0001` |
| Payment terms | Fixed types (advance, before delivery, every 15 days, 30 days, monthly, custom days) plus a free-text note. The workbook's wording is kept in the note |
| When payment is due | On delivery, plus the term's days (advance and before-delivery: due on delivery) |
| Health | **At risk:** anything more than 30 days overdue. **Watch:** anything overdue, or under 70% of due orders paid on time. **Good:** otherwise. **New:** nothing due yet |
| Communication | Follow-ups: what to discuss, with whom, by when, outcome |
| GSTIN lookup | Checked offline now (format, check digit, state, PAN). The Cashfree lookup turns on when keys are added. Field names to confirm with the sandbox |
| Branches | A number only |
| Walk-in customers | One built-in "Direct customer (walk-in)" vendor, with the customer's name and phone on each order |

## Finance

| Question | Default used |
| --- | --- |
| "Portel" | Porter: transport cost for an order (expense type "Porter", linked to an order) |
| Delivery / factory expense | Two expense types: Delivery and Factory |
| Daily production expense | Expense type "Daily production", entered per day (one or more entries) |
| Returns | A credit against an order that lowers what's owed. A credit of 0 is allowed for items remade at no charge |
| Purchases | Supplier, invoice, amount, description. Stock is added separately in Inventory by an admin and can be linked to the purchase |
| Invoices | The OMS doesn't create GST invoices. It tracks amounts (assumes invoicing stays in Tally/Zoho) |
| Payment methods | Cash, UPI, bank transfer, cheque |
| Deleting payments or expenses | Admins only, for mistakes |

## Inventory

| Question | Default used |
| --- | --- |
| Item list | The client's handwritten IMS list, plus glass (one line per glass type), silicone and screens |
| Colours | Not seeded, because the client hasn't named them per item. Admins add each colour (the expected count is shown) |
| Units | Profiles and handle profiles in bars, glass in sq ft, kits in sets, the rest in pieces/rolls/boxes/tubes. Changeable per item |
| Stock changes | Only through movements (in, out, recount), so usage history and the 3-month comparison are exact |
| Automatic deduction | **Not automatic.** Each order shows its material needs (profile r ft, glass sq ft, handles, hinges) and an admin records stock-out against the order. Automatic deduction needs a map from frame + colour to stock line, which the client hasn't given yet |
| Locations | One |

## Sales

| Question | Default used |
| --- | --- |
| Day-by-day view | A continuous range, defaulting to one month to the same day of the next ("Month to month"), compared with the same number of days before it |
| Funnel | Orders and value split by source and sub-source (no enquiry stage) |
| Social media | Platform plus format: Instagram reel or ad, Facebook reel or ad, Google ad or search |
| "Product" | Order type, switchable to frame, glass or handle |

## Not built yet (waiting on the client)

- **Email one-time codes, password-reset emails and payment reminders:** waiting on Resend and domain DNS.
- **WhatsApp alerts.**
- **Importing past orders and payments.**
- **Dark mode:** follows the device setting; there's no manual toggle.
