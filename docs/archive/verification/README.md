# Verification harness (toolchain-less environment)

This project is being developed in an environment with **no Node/npm/tsc/vitest and no network**,
so `npm run typecheck` / `npm run test` cannot be run during development. These Python scripts are
the substitute verification layer. They do NOT replace a real compile/test run — when you next have
a Node toolchain, run `npm install && npm run typecheck && npm run test` as the authoritative gate.

## What each layer catches

| Script | Layer | Catches | Does NOT catch |
|--------|-------|---------|----------------|
| `check_imports.py` | Static — import/export resolution | Importing a symbol that isn't exported; unresolved relative import paths; missing files; follows `export *` barrels | Type *shape* mismatches; generics |
| `check_enums.py` | Static — literal conformance | String literals assigned to enum-typed fields that aren't valid members (e.g. a bad `role`/`zone`/`kind`/`status`) | Structural typing of objects |
| `sim_person.py` | Behavioural — simulation | Logic bugs: re-implements the pure functions and runs the **actual test-file assertions** against them, proving impl ↔ test self-consistency | Anything depending on the real TS runtime |

## How to run
```bash
python3 docs/verification/check_imports.py   # expect: "All local named imports resolve"
python3 docs/verification/check_enums.py      # expect: only the known timezone false-positive, if any
python3 docs/verification/sim_person.py       # expect: "ALL PASS"
```

## Known checker false-positives
- `check_enums.py` matches `timezone: '...'` with its `zone:` regex. `timezone` is `string`, so any
  flag on `timezone: 'Australia/Brisbane'` is spurious — verified manually.
- The required-field checker (`check_seed.py` / `check_required.py`, run ad hoc) is **line-based** and
  (a) does not recognise ES6 **shorthand properties** (`name,` instead of `name: x`) and (b) miscounts
  **nested object** sub-fields (e.g. `contacts.male`/`female`) as top-level required fields. Both
  inflate "missing" reports. When it flags an object literal, confirm against the interface by eye:
  `seed.ts`'s `makeChurch` was flagged but manually verified to cover all 10 required `Church` fields.
  A robust version would need a real TS parser — out of scope without a toolchain.

## check_schema.py (Supabase migrations)
Cross-references entity interface fields against the columns in
`supabase/migrations/001_initial_schema.sql`, so a field with no column (which would
fail at repo-write time) is caught. Known false-positives, confirmed by eye:
- Descends into NESTED object literals (e.g. `Church.contacts.{male,female}`) and
  reports the inner keys as missing top-level fields. Those live inside a single JSONB
  column (`contacts`), so the flags are spurious.
- Child-table fields (`Person.checkInHistory`, `signOutHistory`, `Church.reservations`)
  are intentionally excluded — they map to `check_in_history` / `sign_out_history` /
  `reservations` tables, not columns. Run 2026-06-18: all real fields map.
NOTE: the migrations are SQL DDL — they cannot be executed here. Column *types* and
constraint correctness need a real Postgres/Supabase apply.

## Residual risk (what these scripts canNOT prove)
1. **Structural type compatibility** — e.g. an object literal missing an optional-but-narrowed field,
   or a function arg whose type is *close but not assignable*. Mitigated by manual review against the
   entity interfaces, but a real `tsc` is the only definitive check.
2. **`noUncheckedIndexedAccess`** edge cases beyond the manual `[idx]` grep.
3. **Generic inference** in the repository base classes.

Every change set in this project records a "Verification" note stating which layers were run and the
residual risk that remains for the eventual `tsc`/`vitest` gate.
