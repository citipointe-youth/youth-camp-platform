import copy
AT_CAMP=['arrived','checked_out','departed']
# ---- person-lifecycle.ts port ----
def apply_check_in(p, typ):
    if typ=='in':
        if p['lifecycle']=='cancelled': return {'lifecycle':'cancelled','atCamp':p['atCamp']}
        return {'lifecycle':'arrived','atCamp':True}
    if p['lifecycle'] in ('cancelled','registered'): return {'lifecycle':p['lifecycle'],'atCamp':p['atCamp']}
    return {'lifecycle':'checked_out','atCamp':False}
def with_check_in(p, entry, now):
    nx=apply_check_in(p, entry['type'])
    return {**p,'checkInHistory':p['checkInHistory']+[entry],'lifecycle':nx['lifecycle'],'atCamp':nx['atCamp'],'updatedAt':now}
def with_sign_event(p, ev, now):
    nx=apply_check_in(p, 'in' if ev['type']=='in' else 'out')
    return {**p,'signOutHistory':p['signOutHistory']+[ev],'lifecycle':nx['lifecycle'],'atCamp':nx['atCamp'],'updatedAt':now}

T=[]; F=lambda c,m:T.append((c,m))
# lifecycle test assertions
F(apply_check_in({'lifecycle':'registered','atCamp':False},'in')=={'lifecycle':'arrived','atCamp':True},"reg+in->arrived")
F(apply_check_in({'lifecycle':'arrived','atCamp':True},'in')=={'lifecycle':'arrived','atCamp':True},"arrived+in idempotent")
F(apply_check_in({'lifecycle':'checked_out','atCamp':False},'in')=={'lifecycle':'arrived','atCamp':True},"checked_out+in->arrived")
F(apply_check_in({'lifecycle':'cancelled','atCamp':False},'in')=={'lifecycle':'cancelled','atCamp':False},"cancelled+in noop")
F(apply_check_in({'lifecycle':'arrived','atCamp':True},'out')=={'lifecycle':'checked_out','atCamp':False},"arrived+out->checked_out")
F(apply_check_in({'lifecycle':'registered','atCamp':False},'out')=={'lifecycle':'registered','atCamp':False},"reg+out noop")
F(apply_check_in({'lifecycle':'cancelled','atCamp':False},'out')=={'lifecycle':'cancelled','atCamp':False},"cancelled+out noop")
# withCheckIn immutability + append
p={'id':'p1','lifecycle':'registered','atCamp':False,'checkInHistory':[],'signOutHistory':[]}
entry={'id':'ci1','type':'in'}
nx=with_check_in(p, entry, 'NOW')
F(len(nx['checkInHistory'])==1 and nx['checkInHistory'][0] is entry,"withCheckIn appends entry")
F(nx['lifecycle']=='arrived' and nx['atCamp']==True and nx['updatedAt']=='NOW',"withCheckIn promotes+stamps")
F(len(p['checkInHistory'])==0 and p['lifecycle']=='registered' and p['atCamp']==False,"withCheckIn no mutation")
ev={'id':'so1','type':'out'}
nx=with_sign_event({'id':'p','lifecycle':'arrived','atCamp':True,'checkInHistory':[],'signOutHistory':[]}, ev,'now')
F(len(nx['signOutHistory'])==1 and nx['lifecycle']=='checked_out' and nx['atCamp']==False,"withSignEvent out->checked_out")
nx=with_sign_event({'id':'p','lifecycle':'registered','atCamp':False,'checkInHistory':[],'signOutHistory':[]}, {'id':'si','type':'in'},'now')
F(nx['lifecycle']=='arrived' and nx['atCamp']==True,"withSignEvent in promotes")

# ---- person.service.ts port ----
def is_camper(p): return p['lifecycle'] in AT_CAMP
def is_registrant(p): return p['lifecycle']=='registered'
def can_access(actor,p):
    r=actor['role']
    if r in('admin','director'): return True
    if r=='zoneLeader': return actor.get('zone') is not None and p['zone']==actor.get('zone')
    if r=='church': return actor.get('churchId')==p['churchId']
    return False
def can_access_church(actor,churchId,zone):
    r=actor['role']
    if r in('admin','director'): return True
    if r=='zoneLeader': return bool(actor.get('zone')) and bool(zone) and actor.get('zone')==zone
    if r=='church': return actor.get('churchId')==churchId
    return False

class Repo:
    def __init__(s): s.d={}
    def add(s,p): s.d[p['id']]=p
    def all(s): return list(s.d.values())
    def by_id(s,i): return s.d.get(i)
    def by_church(s,c): return [p for p in s.d.values() if p['churchId']==c]
    def by_zone(s,z): return [p for p in s.d.values() if p['zone']==z]
    def search(s,q): return [p for p in s.d.values() if q.lower() in f"{p['firstName']} {p['lastName']}".lower()]

def P(id,churchId,zone,lifecycle,atCamp):
    return dict(id=id,firstName='Ada',lastName='Lovelace',churchId=churchId,zone=zone,lifecycle=lifecycle,atCamp=atCamp,
        dateOfBirth=None,signOutHistory=[])
repo=Repo()
for p in [P('r1','c1','Yellow','registered',False),P('r2','c2','Blue','registered',False),
          P('c1p','c1','Yellow','arrived',True),P('c2p','c2','Blue','checked_out',False),
          P('x1','c1','Yellow','cancelled',False)]: repo.add(p)

def scoped_all(actor,opts):
    if opts.get('q'): res=repo.search(opts['q'])
    elif opts.get('zone'): res=repo.by_zone(opts['zone'])
    elif opts.get('churchId'): res=repo.by_church(opts['churchId'])
    else: res=repo.all()
    return [p for p in res if can_access(actor,p)]
def list_reg(actor,churchId=None):
    if churchId:
        items=repo.by_church(churchId); zone=items[0]['zone'] if items else None
        if not can_access_church(actor,churchId,zone): return []
        return [p for p in items if is_registrant(p)]
    return [p for p in scoped_all(actor,{}) if is_registrant(p)]
def list_campers(actor,opts={}):
    return [p for p in scoped_all(actor,opts) if is_camper(p)]

A=lambda role,**o: dict(role=role,**o)
ids=lambda l: sorted(p['id'] for p in l); idl=lambda l:[p['id'] for p in l]
# canAccessPerson
F(can_access(A('admin'),{'churchId':'c1','zone':'Yellow'})==True,"admin access")
F(can_access(A('zoneLeader',zone='Yellow'),{'churchId':'c1','zone':'Yellow'})==True,"zl yellow")
F(can_access(A('zoneLeader',zone='Blue'),{'churchId':'c1','zone':'Yellow'})==False,"zl blue denied")
F(can_access(A('church',churchId='c2'),{'churchId':'c1','zone':'Yellow'})==False,"church denied")
# list
F(ids(scoped_all(A('admin'),{}))==['c1p','c2p','r1','r2','x1'],"admin list all")
F(ids(scoped_all(A('church',churchId='c1'),{}))==['c1p','r1','x1'],"church list own")
# listRegistrants
F(ids(list_reg(A('admin')))==['r1','r2'],"registrants admin")
F('c1p' not in idl(list_reg(A('admin'))) and 'x1' not in idl(list_reg(A('admin'))),"registrants exclude camper/cancelled")
F(idl(list_reg(A('church',churchId='c1'),'c1'))==['r1'],"registrants church churchId path")
# listCampers
F(ids(list_campers(A('admin')))==['c1p','c2p'],"campers admin")
F(idl(list_campers(A('zoneLeader',zone='Blue')))==['c2p'],"campers zoneLeader Blue")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions (person-lifecycle.test.ts + person.service.test.ts)")
print("✓ ALL PASS — Step 3 impl and tests self-consistent" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
