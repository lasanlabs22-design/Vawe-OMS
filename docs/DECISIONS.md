# Decisions and assumptions

The OMS was built before every question to the client was answered. Where an answer was missing, the default below was used. Each one can be changed, and the "Where" column says where.

## Access and sign-in

| Question | Default used | Where |
| --- | --- | --- |
| What "verified login" means | Password with lockout (5 tries, 15 minutes), forced change of temporary passwords, server-side sessions. **No one-time codes yet:** email codes can be added once Resend is set up | `apps/api/src/routes/auth.ts` |
| Who uses ops | Admins only | `authRoutes("ops")` |
| Same account for ops and app | Yes. One account, separate sessions | `apps/api/src/lib/sessions.ts` |
| Access granularity | None / view / edit per module (Sales, Vendors, Orders, Finance) **for admins and staff alike** (client decision, 23 Nov). Admins also get Inventory (view/edit) and Catalogue & prices (none/view/edit). Everyone views Inventory; only admins with edit change stock, prices or options. New admins default to full edit; admins who existed before were given full edit once | `packages/shared/src/access.ts` |
| Production-step permissions for factory staff | Not separate: anyone with Orders edit can move stages | Order stage endpoint |
| Forgotten password | An admin resets it in ops (temporary password, shown once) | Ops → People |
| Who changes a sign-in email | Admins, in ops. People can't change their own | Ops → Edit person |

## Orders and DWG

| Question | Default used |
| --- | --- |
| DWG | The drawing and job card the OMS generates from the items (confirmed by the client). Printed or saved as PDF from the browser |
| Stages | As in the client's PDF: In design → In QA → Waiting for DWG confirmation → Waiting for estimate confirmation → Waiting for advance confirmation → In production → Profile cutting → Glass cutting → Profile drill → Hinge hole → Assembly → Packing → Route planning, then Dispatched → Delivered (+ Cancelled). "On hold for procurement" is the hold below, not a stage |
| Moving between stages | Any stage can be set, forwards or back. Every move is recorded with who and when |
| Procurement hold | A flag on the order at any stage before dispatch. The stage stays the same; a held order can't move forward within production until it's released |
| Stages per order or per item | Per order |
| Editing | Details can change any time. Items and vendor only before production; the estimate is then recalculated |
| Expected delivery | The workbook's rule (2 working days after the order date, Sundays off) unless set on the order |
| Order code | `VW-YYMM-0001`, numbered per month |
| Item quantity | "No. of shutters" |
| Handle colour | Its own field per item, from the frame colour list. It follows the frame colour until chosen separately. Items made before it existed took their frame colour |
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
| Vendors | B2B buyers who pay Vawe. Raw material suppliers are a separate list (Inventory → Suppliers) |
| Vendor ID | `VND-0001` |
| Payment terms | Fixed types (advance, before delivery, every 15 days, 30 days, monthly, custom days) plus a free-text note. The workbook's wording is kept in the note |
| When payment is due | On delivery, plus the term's days (advance and before-delivery: due on delivery) |
| Health | **At risk:** anything more than 30 days overdue. **Watch:** anything overdue, or under 70% of due orders paid on time. **Good:** otherwise. **New:** nothing due yet |
| Communication | Follow-ups: what to discuss, with whom, by when, outcome |
| GSTIN lookup | Checked offline first (format, check digit, state, PAN), then Cashfree Secure ID when keys are set. Field names confirmed with the sandbox. Fetch fills legal and trade name, address, city, pincode, state (from the GST record), GST status, business type, taxpayer type, registration date and branches (principal place plus additional places). A GSTIN Cashfree has no record of is shown as not found. Cashfree only accepts whitelisted IPs, so production needs Railway's IP whitelisted or the public-key option |
| Branches | A number only |
| Walk-in customers | One built-in "Direct customer (walk-in)" vendor, with the customer's name and phone on each order |

## Finance

| Question | Default used |
| --- | --- |
| "Portel" | Porter: transport cost for an order (expense type "Porter", linked to an order) |
| Delivery / factory expense | Two expense types: Delivery and Factory |
| Daily production expense | Expense type "Daily production", entered per day (one or more entries) |
| Returns | A credit against an order that lowers what's owed. A credit of 0 is allowed for items remade at no charge |
| Purchases | Supplier, invoice, amount, description. The supplier is picked from the supplier list; a new name is added to the list automatically. Stock is added separately in Inventory by an admin and can be linked to the purchase |
| Invoices | The OMS doesn't create GST invoices. It tracks amounts (assumes invoicing stays in Tally/Zoho) |
| Payment methods | Cash, UPI, bank transfer, cheque |
| Deleting payments or expenses | Admins only, for mistakes |

## Inventory

| Question | Default used |
| --- | --- |
| Item list | The IMS list in the client's typed requirements PDF, plus glass (one line per glass type), silicone and screens. "Silicum fold" in the PDF is read as the slide-cum-fold kit (S+1 to S+5) |
| Raw material suppliers | Inventory → Suppliers: name, contact, phone, GSTIN, what they supply, notes, with purchase count and last purchase. Spend is shown only to people with Finance view. Admins with Inventory edit add and edit them |
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
