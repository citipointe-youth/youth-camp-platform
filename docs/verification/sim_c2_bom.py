# Port of stripBom/parseCsv + the fixed remind() logic, vs their test assertions.
def strip_bom(s): return s[1:] if s and ord(s[0])==0xFEFF else s
# (parseCsv full port is overkill; assert the BOM behaviour which is the fix)
def first_header_after_bom(s):
    s=strip_bom(s)
    return s.split('\n')[0].split(',')[0]

T=[];F=lambda c,m:T.append((c,m))
F(strip_bom('﻿firstName')=='firstName',"stripBom removes leading FEFF")
F(strip_bom('firstName')=='firstName',"stripBom noop when absent")
F(strip_bom('a﻿b')=='a﻿b',"stripBom only leading")
F(strip_bom('')=='',"stripBom empty")
F(first_header_after_bom('﻿firstName,lastName\nAda,Lovelace')=='firstName',"first header matches after BOM strip")

# remind() fixed logic port
def remind(actor, ids, store):
    # assertCan(reminder:send): only church/director/admin reach here (zoneLeader lacks it)
    if not isinstance(ids,list) or len(ids)==0: raise ValueError("BadRequest")
    count=0
    for i in ids:
        r=store.get(i)
        if not r: continue
        if r['status']=='cancelled': continue
        if actor['role']=='church' and r['churchId']!=actor.get('churchId'): continue
        if actor['role']=='zoneLeader' and actor.get('zone') and r['zone']!=actor.get('zone'): continue
        count+=1
    return count

store={
 'r1':dict(churchId='c1',zone='Yellow',status='registered'),
 'r2':dict(churchId='c1',zone='Yellow',status='registered'),
 'r3':dict(churchId='c2',zone='Blue',status='registered'),
 'r4':dict(churchId='c3',zone='Yellow',status='registered'),
 'r5':dict(churchId='c2',zone='Blue',status='cancelled'),
}
A=lambda role,**o:dict(role=role,**o)
F(remind(A('director'),['r1','r3','missing'],store)==2,"director ignores missing")
F(remind(A('church',churchId='c1'),['r1','r2','r3'],store)==2,"church own church only")
F(remind(A('admin'),['r1','r3','r4','r5'],store)==3,"admin excludes cancelled r5 (C2 fix)")
F(remind(A('director'),['r1','r5'],store)==1,"director skips cancelled (C2 fix)")
# zone-leader scope (defensive; RBAC blocks reach in practice but logic correct)
F(remind(A('zoneLeader',zone='Yellow'),['r1','r3','r4'],store)==2,"zoneLeader scoped to zone (r3 Blue skipped)")
try:
    remind(A('director'),[],store); F(False,"empty ids should raise")
except ValueError: F(True,"empty ids raises BadRequest")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions (csv.test.ts BOM + remind C2 fix)")
print("✓ ALL PASS — BOM + C2 fixes self-consistent" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
