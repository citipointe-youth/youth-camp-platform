import re, os
ROOT=os.getcwd()
SQL=open(os.path.join(ROOT,'supabase/migrations/001_initial_schema.sql'),encoding='utf-8').read()

# Parse "create table X ( ... );" -> column names (snake_case)
tables={}
for m in re.finditer(r'create table (\w+)\s*\((.*?)\n\);', SQL, re.S):
    name=m.group(1); body=m.group(2)
    cols=[]
    for line in body.splitlines():
        line=line.strip()
        cm=re.match(r'(?:"(\w+)"|(\w+))\s+(text|int|uuid|boolean|numeric|date|timestamptz|jsonb|text\[\])', line)
        if cm and not line.startswith(('constraint','primary','unique','create index','--')):
            cols.append(cm.group(1) or cm.group(2))
    tables[name]=set(cols)

def snake(s): return re.sub(r'([A-Z])', r'_\1', s).lower()

def required_fields(entity_file, iface):
    txt=open(os.path.join(ROOT,'src/core/entities',entity_file),encoding='utf-8').read()
    m=re.search(r'export interface '+iface+r'\s*\{(.*?)\n\}', txt, re.S)
    if not m: return None
    fields=[]
    for line in m.group(1).splitlines():
        fm=re.match(r'\s*(\w+)\??:', line)
        if fm: fields.append(fm.group(1))
    return fields

# Person -> people table. Skip the nested array fields stored as child tables.
CHILD_TABLE_FIELDS={'checkInHistory','signOutHistory'}
checks=[
    ('person.ts','Person','people',CHILD_TABLE_FIELDS),
    ('church.ts','Church','churches',{'reservations'}),  # reservations -> child table
    ('user.ts','User','users',set()),
    ('accommodation.ts','AccommodationBlock','accommodation_blocks',set()),
    ('schedule.ts','ScheduleItem','schedule_items',set()),
    ('devotional.ts','Devotional','devotionals',set()),
    ('note.ts','StudentNote','notes',set()),
    ('notification.ts','Notification','notifications',set()),
]
problems=[]
for ef,iface,table,skip in checks:
    fields=required_fields(ef,iface)
    if fields is None: problems.append(f"could not parse {iface}"); continue
    if table not in tables: problems.append(f"no table '{table}'"); continue
    cols=tables[table]
    missing=[]
    for f in fields:
        if f in skip: continue
        col=snake(f)
        # 'order' is quoted in SQL; check raw too
        if col not in cols and f.lower() not in cols:
            missing.append(f"{f}->{col}")
    status='✓' if not missing else '✗'
    print(f"  {status} {iface} -> {table}: {len(fields)-len(missing)-len(skip&set(fields))}/{len(fields)} mapped"+(f"  MISSING {missing}" if missing else ""))
    if missing: problems.append((iface,missing))

print()
print("✓ All entity fields map to columns (child-table fields excluded)." if not problems else "✗ Schema gaps above.")
