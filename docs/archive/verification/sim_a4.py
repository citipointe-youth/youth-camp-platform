# Port of the rewritten admin.reset + admin.newYear, vs the updated test assertions.
class Repo:
    def __init__(s, items=None): s.d={i['id']:dict(i) for i in (items or [])}
    def all(s): return list(s.d.values())
    def save(s,e): s.d[e['id']]=dict(e)
    def delete(s,i): s.d.pop(i,None)
    def delete_all(s):
        n=len(s.d); s.d={}; return n

def replace_all(repo, records):
    repo.delete_all()
    for r in records: repo.save(r)

def make_repos():
    return dict(
        user=Repo([{'id':'u1','role':'admin'},{'id':'u2','role':'church'}]),
        church=Repo([{'id':'c1'},{'id':'c2'}]),
        registrant=Repo([{'id':'r1'},{'id':'r2'}]),
        camper=Repo([{'id':'cmp1'},{'id':'cmp2'}]),
        accom=Repo([{'id':'b1'}]),
        faq=Repo([{'id':'f1'}]),
        sched=Repo([{'id':'s1'}]),
        notif=Repo([{'id':'n1'},{'id':'n2'}]),
        note=Repo([{'id':'nt1'}]),
        devo=Repo([{'id':'d1'}]),
        settings={'year':2026,'campMode':'pre-camp'},
        snapshot=None,
    )

def reset(R, role):
    if role!='admin': raise PermissionError
    for k in ['registrant','camper','church','accom','faq','sched','notif','note','devo']:
        R[k].delete_all()
    for u in [u for u in R['user'].all() if u['role']!='admin']:
        R['user'].delete(u['id'])
    return {'ok':True}

def new_year(R, role, year):
    if role!='admin': raise PermissionError
    if R['settings'] is None: raise LookupError("no settings")
    if R['snapshot'] is None: raise LookupError("no snapshot")
    for k in ['registrant','camper','note','notif']: R[k].delete_all()
    admins=[u for u in R['user'].all() if u['role']=='admin']
    replace_all(R['church'], R['snapshot']['churches'])
    replace_all(R['accom'], R['snapshot']['accommodationBlocks'])
    replace_all(R['faq'], R['snapshot']['faqs'])
    replace_all(R['sched'], R['snapshot']['schedule'])
    replace_all(R['devo'], R['snapshot']['devotionals'])
    R['user'].delete_all()
    for a in admins: R['user'].save(a)
    for u in R['snapshot']['users']:
        if u.get('role')=='admin': continue
        R['user'].save(u)
    R['settings']={'year':year,'campMode':'pre-camp'}
    return R['settings']

def baseline():
    return dict(churches=[{'id':'baseC'}],users=[{'id':'baseChurchUser','role':'church'}],
        accommodationBlocks=[{'id':'baseB'}],faqs=[{'id':'baseF'}],schedule=[{'id':'baseS'}],
        devotionals=[{'id':'baseD'}])

ids=lambda r: sorted(x['id'] for x in r.all())
T=[];F=lambda c,m:T.append((c,m))
# reset
R=make_repos(); reset(R,'admin')
F(ids(R['registrant'])==[] and ids(R['camper'])==[] and ids(R['church'])==[] and ids(R['accom'])==[]
  and ids(R['faq'])==[] and ids(R['sched'])==[] and ids(R['notif'])==[] and ids(R['note'])==[] and ids(R['devo'])==[],"reset wipes all data")
F(ids(R['user'])==['u1'] and R['user'].all()[0]['role']=='admin',"reset keeps only admin")
F(R['settings']['year']==2026,"reset keeps settings")
try: reset(make_repos(),'church'); F(False,"reset non-admin should throw")
except PermissionError: F(True,"reset forbids non-admin")
# reset needs NO snapshot
R=make_repos(); F(reset(R,'admin')=={'ok':True},"reset works with no snapshot")
# newYear requires snapshot
R=make_repos()
try: new_year(R,'admin',2027); F(False,"newYear no-snapshot should throw")
except LookupError: F(True,"newYear requires snapshot")
# newYear happy path
R=make_repos(); R['snapshot']=baseline(); R['settings']={'year':2026,'campMode':'at-camp'}
res=new_year(R,'admin',2027)
F(res['year']==2027 and res['campMode']=='pre-camp',"newYear bumps year + pre-camp")
F(ids(R['registrant'])==[] and ids(R['camper'])==[] and ids(R['note'])==[] and ids(R['notif'])==[],"newYear purges people+transient")
F(ids(R['church'])==['baseC'] and ids(R['accom'])==['baseB'] and ids(R['faq'])==['baseF'] and ids(R['sched'])==['baseS'] and ids(R['devo'])==['baseD'],"newYear restores scaffold")
F(ids(R['user'])==sorted(['u1','baseChurchUser']) and [u for u in R['user'].all() if u['role']=='admin'][0]['id']=='u1',"newYear keeps admin + restores snapshot users")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions (admin reset + newYear A3/A4)")
print("✓ ALL PASS — A3/A4 impl and tests self-consistent" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
