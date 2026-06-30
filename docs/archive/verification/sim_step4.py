# Port of the Step-4 PersonService write surface, vs person.service.test.ts.
import itertools
_n=itertools.count(1)
def nid(p): return f"{p}_{next(_n)}"
AT_CAMP=['arrived','checked_out','departed']
def can_access(actor,p):
    r=actor['role']
    if r in('admin','director'): return True
    if r=='zoneLeader': return actor.get('zone') is not None and p['zone']==actor.get('zone')
    if r=='church': return actor.get('churchId')==p['churchId']
    return False
def apply_check_in(p,typ):
    if typ=='in':
        if p['lifecycle']=='cancelled': return ('cancelled',p['atCamp'])
        return ('arrived',True)
    if p['lifecycle'] in('cancelled','registered'): return (p['lifecycle'],p['atCamp'])
    return ('checked_out',False)

class Repo:
    def __init__(s): s.d={}
    def save(s,p): s.d[p['id']]=dict(p); return dict(p)
    def find(s,i): return dict(s.d[i]) if i in s.d else None
    def all(s): return [dict(v) for v in s.d.values()]

def mk(repo):
    def get_owned(actor,i):
        p=repo.find(i)
        if not p or not can_access(actor,p): raise PermissionError("not found")
        return p
    def create(actor,inp):
        if not can_access(actor,{'churchId':inp['churchId'],'zone':inp['zone']}): raise ValueError("scope")
        p=dict(id=nid('person'),firstName=inp['firstName'],lastName=inp['lastName'],gender=inp['gender'],
               kind=inp.get('kind','youth'),churchId=inp['churchId'],zone=inp['zone'],
               lifecycle='registered',atCamp=False,checkInHistory=[],signOutHistory=[],grade=inp.get('grade'))
        return repo.save(p)
    def update(actor,i,patch):
        ex=get_owned(actor,i)
        safe={k:v for k,v in patch.items() if k not in('id','lifecycle','atCamp','checkInHistory','signOutHistory','createdAt')}
        ex.update(safe); return repo.save(ex)
    def remove(actor,i):
        get_owned(actor,i); del repo.d[i]
    def check_in(actor,i,entry):
        p=get_owned(actor,i); lc,ac=apply_check_in(p,entry['type'])
        p['checkInHistory']=p['checkInHistory']+[{**entry,'id':nid('ci')}]; p['lifecycle']=lc; p['atCamp']=ac
        return repo.save(p)
    def sign_event(actor,i,ev):
        p=get_owned(actor,i); lc,ac=apply_check_in(p,'in' if ev['type']=='in' else 'out')
        p['signOutHistory']=p['signOutHistory']+[{**ev,'id':nid('so')}]; p['lifecycle']=lc; p['atCamp']=ac
        return repo.save(p)
    def list_reg(actor): return [p for p in repo.all() if can_access(actor,p) and p['lifecycle']=='registered']
    def list_camp(actor): return [p for p in repo.all() if can_access(actor,p) and p['lifecycle'] in AT_CAMP]
    return dict(create=create,update=update,remove=remove,checkIn=check_in,signEvent=sign_event,listReg=list_reg,listCamp=list_camp)

A=lambda role,**o: dict(role=role,**o)
T=[];F=lambda c,m:T.append((c,m))
def fresh():
    r=Repo(); r.save(dict(id='r1',firstName='Ada',lastName='Lovelace',gender='female',kind='youth',churchId='c1',zone='Yellow',lifecycle='registered',atCamp=False,checkInHistory=[],signOutHistory=[])); return r,mk(r)

r,s=fresh()
p=s['create'](A('director'),dict(firstName='New',lastName='Camper',gender='female',churchId='c1',churchName='V',zone='Yellow'))
F(p['lifecycle']=='registered' and p['atCamp']==False and p['kind']=='youth',"create registered")
F(any(x['id']==p['id'] for x in s['listReg'](A('admin'))),"create shows in registrants")
try: s['create'](A('church',churchId='c1'),dict(firstName='X',lastName='Y',gender='male',churchId='c2',churchName='O',zone='Blue')); F(False,"scope block")
except ValueError: F(True,"create scope blocked")
r,s=fresh()
u=s['checkIn'](A('admin'),'r1',dict(sessionId='s1',sessionLabel='AM',type='in',leaderId='u',timestamp='t'))
F(u['lifecycle']=='arrived' and u['atCamp']==True and len(u['checkInHistory'])==1,"checkIn promotes")
F(any(x['id']=='r1' for x in s['listCamp'](A('admin'))) and not any(x['id']=='r1' for x in s['listReg'](A('admin'))),"moves reg->camper view")
out=s['signEvent'](A('admin'),'r1',dict(type='out',leaderName='L',authorId='u',timestamp='t2'))
F(out['lifecycle']=='checked_out' and out['atCamp']==False,"signEvent out->checked_out")
r,s=fresh()
up=s['update'](A('admin'),'r1',dict(grade=11,lifecycle='arrived',atCamp=True))
F(up['grade']==11 and up['lifecycle']=='registered' and up['atCamp']==False,"update ignores lifecycle/atCamp")
r,s=fresh(); s['remove'](A('admin'),'r1'); F(r.find('r1') is None,"remove deletes")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions (PersonService Step-4 write surface)")
print("✓ ALL PASS" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
