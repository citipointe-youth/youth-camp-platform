import re, os, sys
ROOT = os.getcwd()
SRC = os.path.join(ROOT, 'src')

# Files in scope for Phase 0 + Phase 1 Step 1
SCOPE = [
    'app.ts','index.ts','data/seed.ts','data/index.ts',
    'core/entities/person.ts','core/entities/person.test.ts','core/entities/index.ts',
    'core/types/enums.ts',
    'repositories/interfaces/entity-repositories.ts',
    'repositories/in-memory/in-memory.repositories.ts',
    'repositories/in-memory/person.repository.test.ts',
    'container.ts',
    'services/person-lifecycle.ts',
    'services/person-lifecycle.test.ts',
    'services/person.service.ts',
    'services/person.service.test.ts',
    'services/accommodation-occupancy.ts',
    'services/accommodation-occupancy.test.ts',
    'services/accommodation.service.ts',
    'services/dashboard.service.ts',
    'utils/csv.ts',
    'utils/csv.test.ts',
    'services/registrant.service.ts',
    'services/admin.service.ts',
    'services/admin.characterisation.test.ts',
    'repositories/interfaces/base.repository.ts',
    'repositories/in-memory/in-memory.base.repository.ts',
    'core/entities/settings.ts',
    'utils/date.ts',
    'utils/date.test.ts',
    'services/checkin.service.ts',
    'services/checkin.characterisation.test.ts',
    'services/import.service.ts',
    'services/import.service.test.ts',
    'services/auth.service.ts',
    'services/auth.service.test.ts',
    'utils/rate-limiter.ts',
    'utils/rate-limiter.test.ts',
    'api/http/express-adapter.ts',
    'services/dashboard.service.ts',
    'services/dashboard.service.test.ts',
    'services/notification.service.ts',
    'services/account.service.ts',
    'services/auth.service.ts',
    'core/validation/account.schema.ts',
    'core/validation/auth.schema.ts',
    'services/registrant.characterisation.test.ts',
    'services/camper.characterisation.test.ts',
    'services/checkin.characterisation.test.ts',
    'services/accommodation.characterisation.test.ts',
    'services/admin.characterisation.test.ts',
]

def read(p):
    with open(p, encoding='utf-8') as f: return f.read()

# Collect exported symbols from any .ts file (named exports + re-exports)
EXPORT_RE = re.compile(r'^export\s+(?:async\s+)?(?:type|interface|class|const|function|enum)\s+([A-Za-z0-9_]+)', re.M)
REEXPORT_RE = re.compile(r"^export\s+\*\s+from\s+'([^']+)'", re.M)
EXPORT_LIST_RE = re.compile(r'^export\s+(?:type\s+)?\{([^}]+)\}', re.M)

def resolve(base_file, rel):
    d = os.path.dirname(base_file)
    cand = os.path.normpath(os.path.join(d, rel))
    for ext in ('.ts', '/index.ts'):
        if os.path.exists(cand+ext): return cand+ext
    if os.path.exists(cand): return cand
    return None

exports_cache = {}
def exports_of(path, _seen=None):
    if path in exports_cache: return exports_cache[path]
    _seen = _seen or set()
    if path in _seen: return set()
    _seen.add(path)
    if not path or not os.path.exists(path): return set()
    txt = read(path)
    syms = set(EXPORT_RE.findall(txt))
    for m in EXPORT_LIST_RE.findall(txt):
        for part in m.split(','):
            name = part.strip().split(' as ')[-1].strip()
            if name: syms.add(name)
    # follow re-export barrels
    for rel in REEXPORT_RE.findall(txt):
        tgt = resolve(path, rel)
        if tgt: syms |= exports_of(tgt, _seen)
    exports_cache[path] = syms
    return syms

IMPORT_RE = re.compile(r"import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+'([^']+)'")
problems = []
for rel in SCOPE:
    fp = os.path.join(SRC, rel)
    if not os.path.exists(fp):
        problems.append(f"MISSING FILE: {rel}"); continue
    txt = read(fp)
    for names, src in IMPORT_RE.findall(txt):
        if not src.startswith('.'):  # external pkg (vitest, express, zod) - skip
            continue
        tgt = resolve(fp, src)
        if not tgt:
            problems.append(f"{rel}: UNRESOLVED import path '{src}'"); continue
        avail = exports_of(tgt)
        for raw in names.split(','):
            n = raw.strip().split(' as ')[0].strip()
            if n.startswith('type '):  # inline type modifier: `type Foo`
                n = n[len('type '):].strip()
            if not n:
                continue
            if n not in avail:
                problems.append(f"{rel}: '{n}' NOT exported by '{src}' ({os.path.relpath(tgt,SRC)})")

print(f"Checked {len(SCOPE)} files.")
if problems:
    print(f"\n{len(problems)} IMPORT/EXPORT PROBLEM(S):")
    for p in problems: print("  ✗", p)
else:
    print("\n✓ All local named imports resolve to real exports.")
