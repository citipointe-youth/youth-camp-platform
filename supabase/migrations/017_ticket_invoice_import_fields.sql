-- 017: Ticket List / Invoice import fields.
--
-- Adds the columns needed to support importing Elvanto's separate Ticket List and
-- Invoice exports (previously only a combined Form CSV was imported):
--   - ticket_number / invoice_number: owned by the Ticket List import; invoice_number
--     is also read by the Invoice import to cross-reference rows against the same person.
--   - accommodation_kind_confidence: 'guessed' | 'confirmed' | null. Null means "no
--     value yet, or set the old way before this feature existed" — it must NOT
--     retroactively look like a guess, so existing rows are left null, not defaulted
--     to 'guessed'.
--   - discount_amount / amount_paid / fees_amount / tax_amount: owned by the Invoice
--     import (numeric currency amounts).
--   - needs_review / needs_review_reason: set when the Ticket List or Invoice import
--     can't confidently match a row to an existing person and creates an orphan record.
--
-- Backward-compatible and idempotent.
alter table people add column if not exists ticket_number text null;
alter table people add column if not exists invoice_number text null;
alter table people add column if not exists accommodation_kind_confidence text null
  check (accommodation_kind_confidence in ('guessed', 'confirmed') or accommodation_kind_confidence is null);
alter table people add column if not exists discount_amount numeric null;
alter table people add column if not exists amount_paid numeric null;
alter table people add column if not exists fees_amount numeric null;
alter table people add column if not exists tax_amount numeric null;
alter table people add column if not exists needs_review boolean not null default false;
alter table people add column if not exists needs_review_reason text null;
