# Multi-source CSV import (Form / Ticket List / Invoice) — design

**Status:** approved by user without a section-by-section review gate ("Yep go for it... fan out
subagents to speed it up"); real column headers for Ticket List / Invoice will be supplied later
and used to correct the best-guess field mappings below. Implementation proceeded immediately per
explicit instruction.

## Problem

The camp's Elvanto data now comes as **three separate exports** instead of one manually-merged
CSV: a Form export (Submissions tab — demographics/medical), a Ticket List export
(Invoices & Tickets tab — accommodation type, ticket/invoice numbers, payment status), and an
Invoice/Billing Contacts export (payment amounts, discounts, fees, tax). Each can arrive in any
order, any number of times, and must fill in only the fields it owns without clobbering data
another source already wrote.

## Current-state findings that shaped this design

- `src/services/import.service.ts` today assumes ONE CSV has everything (form + ticket-ish
  columns combined) — historically the admin merged exports by hand before uploading.
- Matching is `(churchId, firstName.toLowerCase(), lastName.toLowerCase())` with a mobile-digits
  tiebreak (`nameChurchKey`/`pickMatch`/`phoneKey`) — church-scoped, not fuzzy.
- The import **deletes** any person absent from the uploaded file ("upload is authoritative") —
  fine for a full-roster Form export, unsafe for a partial-coverage file.
- With `updateExisting:true` (which the SPA always sends), several fields overwrite
  unconditionally even when the CSV cell is blank — e.g. `gender` defaults to `'other'` on an
  empty cell, silently clobbering a good existing value. Pre-existing bug, in scope to fix here.
- No `ticketNumber`/`invoiceNumber`/cost-breakdown/confidence-marker fields exist anywhere in the
  schema. CSV-only parsing (no Excel) — confirmed sufficient, all three sources will be CSV.
- A same-day, unrelated commit (`27dca06`) added `Church.accommodationOverride`, which already
  force-overwrites accommodation type for students of a given church on Form import — this new
  work must respect that existing precedence.

## Decisions (confirmed with user)

| Topic | Decision |
|---|---|
| Deletion scope | Absent-record deletion stays exactly as today, **Form-export only**. Ticket List / Invoice imports never delete. |
| Matching scope | Ticket List / Invoice match by name(+phone) **across all churches** (no church field in those exports). Form import keeps today's church-scoped matching. |
| Fuzzy matching | Normalize-then-exact first; bounded Levenshtein (≤2) fallback, but only auto-matches on a single unambiguous candidate. Two-or-more close candidates or none ⇒ orphan + warning. |
| File format | CSV only for all three sources — no Excel/XLSX parsing added. |
| Real headers | Not available yet — best-guess aliases via the existing `field(row, ...aliases)` multi-alias pattern; user will correct after a real test import. |
| Accommodation precedence | `Church.accommodationOverride` still wins over Ticket List truth (matches its existing precedence over Form import). Ticket List truth applies only when no override exists for that church. |
| Price-inference source | Built **dynamically** each run from already-confirmed (`accommodationKindConfidence==='confirmed'`) Ticket-List-sourced people this season — no revived settings fields. |
| Price match tolerance | **Exact match only** — no nearest-price fallback tier. |
| Unmatched-row warning surface | Both: the import response `warnings[]` (as today) **and** a persistent `needsReview`/`needsReviewReason` flag on the record, visible later (new schema fields — didn't exist before). |
| Merge-duplicates UI | **Out of scope.** Flag only; actual merge is a manual admin action via existing edit/delete tools. |
| Blank-clobber fix | **In scope** — extend "never overwrite a good value with a blank CSV cell" to Form import's own fields too (not just the two new sources), since it's the same class of data-loss risk the whole project is about. |

## Architecture

Three separate backend services (mirrors the existing `church-import.service.ts` /
`/import/churches` precedent of "different import shape = different service"), sharing one new
core module:

- `src/services/import.service.ts` (existing, Form) — untouched except the blank-clobber fix.
- `src/services/ticket-import.service.ts` (NEW) + `POST /import/tickets`.
- `src/services/invoice-import.service.ts` (NEW) + `POST /import/invoices`.
- `src/services/person-matching.ts` (NEW, shared) — name normalization, bounded fuzzy fallback,
  and a generic `mergeOwnedFields` primitive ("only touch these keys, never blank a good value").

SPA: **one** upload screen with a Form/Ticket List/Invoice source selector (`.seg` control,
matching the existing check-in day-selector pattern), reusing the existing dry-run → preview →
confirm flow, parameterized by endpoint instead of tripled.

## Data model additions (migration `017`)

New `people` columns, each owned by exactly one source:

| Column | Type | Owner |
|---|---|---|
| `ticket_number` | `text` | Ticket List |
| `invoice_number` | `text` | Ticket List (read by Invoice for cross-referencing) |
| `accommodation_kind_confidence` | `text` (`'guessed'\|'confirmed'`, checked) | Ticket List sets `'confirmed'`; Invoice-inference sets `'guessed'` only when nothing better exists; `null` = pre-existing/unrelated value, never retroactively a guess |
| `discount_amount`, `amount_paid`, `fees_amount`, `tax_amount` | `numeric` | Invoice |
| `needs_review` | `boolean not null default false` | Ticket List / Invoice, on low/no-confidence match |
| `needs_review_reason` | `text` | ditto |

Full plumbing: `Person` entity, `supabase.people.ts` (both directions + `PERSON_UPDATE_COLS`),
`RegistrantDto`/`toRegistrantDto` (Data tab is the review surface), `registrant.controller.ts`
PATCH path (so an admin can clear `needsReview` or hand-correct a field). In-memory repository
needs no changes — it deep-clones whole objects.

## `person-matching.ts` — matching & merge core

`findPersonMatch(index, {firstName, lastName, phone?})`: build a cross-church
`normalizedFullName → Person[]` index once per run; exact match on the normalized key, phone as
tiebreaker on a multi-person pool (never auto-picks on an unresolved multi-person pool with no
phone — deliberately stricter than the existing church-scoped `pickMatch`); if the exact key has
zero entries, fall back to Levenshtein ≤2 over distinct normalized names, resolving to at most one
person per candidate key via the same phone tiebreak, and only auto-matching when exactly one
person survives across all candidate keys. Hand-rolled Levenshtein (no new dependency — repo has
a strong minimal-deps bias).

`mergeOwnedFields(existing, incoming, ownedKeys)`: returns a new object where each `ownedKeys`
field is overwritten only if `incoming[key]` is present and non-blank (`''`, `null`, `undefined`,
`[]` all count as blank; `0`/`false` don't); everything else is copied from `existing` untouched.
Array fields are atomic (whole-array replace or keep, no element merge). This is the same
primitive used for the Form-import blank-clobber fix.

## `ticket-import.service.ts`

Zod: `{csvData, eventOccurrence?, dryRun}`. No church scoping, no `updateExisting` toggle — every
row either updates a match or creates a `needsReview` orphan. Owns: `accommodationKind` (+
`accommodationKindConfidence:'confirmed'`, unconditional overwrite unless a church override
applies, in which case the override wins and is also marked `'confirmed'`), `ticketNumber`,
`invoiceNumber`, `paymentStatus` (string→enum mapper, assumed values `Paid`/`Partial`/`Pending`).
Never deletes. Orphans get no `churchId` (verified this makes them invisible to church/zoneLeader
RBAC scoping automatically — visible only to admin/director, which is the desired review
visibility). Optional `eventOccurrence` filter + an auto-warning (not a hard block) when a file
contains multiple distinct occurrence values and no filter was given.

## `invoice-import.service.ts`

Zod: `{csvData, dryRun, minAccommodationSampleSize=3, minAccommodationMajorityRatio=0.9}`. Owns:
`registrationCost` (reused as "ticket total"), `discountCode` (reused), new `discountAmount`,
`amountPaid`, `feesAmount`, `taxAmount`. **Never creates orphans** — `Person.churchId` is
non-nullable and this export has no church field, so an unmatchable row goes to
`unmatchedInvoices[]` for manual reconciliation instead of a fabricated placeholder. Matches by
`invoiceNumber` (tier 1, cross-referenced against Ticket-List-set values) then billing-contact
name+phone (tier 2, if the real export turns out to carry one — flagged as the single biggest
open risk, since the user's field list has no name column at all). An invoice covering multiple
registrants withholds all per-person dollar fields (can't attribute a total) but still applies a
flat `discountCode`. Accommodation-type guess: exact-cents match only against a price→type table
built fresh each run from confirmed Ticket-List data, requiring ≥3 confirmed samples at that exact
price AND a ≥90% kind-majority before trusting it (guards against one-off coincidence and
non-distinguishing flat fees) — guesses never overwrite an existing confirmed value, and are
skipped entirely for multi-person invoice groups.

## SPA changes

Source selector (`.seg`, three tabs) on the existing upload screen, config-table-driven
(`IMPORT_SOURCES`) so `adminUpload`/`_confirmImport`/`_createPhantomChurches`'s three hardcoded
`/import/csv` call sites become one lookup instead of tripling the flow. Dry-run preview keeps its
existing created/updated/skipped/deleted/errors line for all three sources, with an added
source-specific "N flagged for review" line when applicable. `needsReview` records surface as a
filter + column on the **Data tab** (not the at-camp-only, students-only `adminStudents` screen),
with a small modal showing the reason and a "Mark reviewed" button (PATCH-only — no merge tool).
Accommodation column gets an amber "Guessed" pill when `accommodationKindConfidence==='guessed'`;
no badge for `'confirmed'`/`null` (matches the app's existing convention of only badging the
exceptional state).

## Known open risks (flagged for the user's real-sample follow-up)

1. ~~**Invoice export may have no name field at all**~~ — **RESOLVED 2026-07-02.** The real
   export does have a name field (plain `First Name`/`Last Name`), but it's the **billing
   contact**, frequently a parent rather than the registrant (e.g. an invoice for "Jacqueline
   Hales" covers attendee "Gizelle Hales") — confirming the tiered design was the right call:
   `invoiceNumber` cross-reference is tier 1 and is what actually resolves real invoices;
   billing-name matching (tier 2) is a fallback and always emits a "verify" warning. See
   `src/services/multi-source-import.integration.test.ts`.
2. ~~Ticket-type strings, payment-status strings, and all column header names are assumed~~ —
   **RESOLVED 2026-07-02** against a real sample (see `CLAUDE.md`'s dated batch note for the
   exact corrected headers). One thing the original design didn't anticipate: Ticket List has a
   `Ticket Status` column — a non-`Active` ticket (cancelled/refunded) is now skipped rather than
   treated as confirmed accommodation truth.
3. Orphans created by Ticket List have no church; the SPA needs to render that gracefully
   ("Unassigned" rather than a blank cell).
4. No bulk "mark all reviewed" action — one-at-a-time only, acceptable for now given manual merge
   is already out of scope.
5. **Still unverified**: `Invoice Status` (e.g. `Paid`) is deliberately NOT filtered on for the
   Invoice import, unlike Ticket List's `Ticket Status` — there's no equally clear "only this one
   value is valid" signal (unlike tickets, invoices legitimately have several valid non-final
   states like `Unpaid`/`Overdue`/`Partial` that should still be imported), so filtering was
   judged more likely to wrongly drop real financial data than to help. Revisit if a real
   `Cancelled`/`Void`/`Draft` invoice is ever seen importing incorrectly.
