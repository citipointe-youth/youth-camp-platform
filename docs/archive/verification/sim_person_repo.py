# Port of InMemoryPersonRepository logic, run against person.repository.test.ts assertions.
import copy
AT_CAMP=['arrived','checked_out','departed']
class Repo:
    def __init__(self): self.store={}
    def save(self,p): self.store[p['id']]=copy.deepcopy(p)
    def find_all(self): return [copy.deepcopy(p) for p in self.store.values()]
    def find_by_id(self,i): return copy.deepcopy(self.store[i]) if i in self.store else None
    def search(self,q):
        q=q.lower()
        return [copy.deepcopy(p) for p in self.store.values()
                if q in f"{p['firstName']} {p['lastName']}".lower()
                or q in p['firstName'].lower() or q in p['lastName'].lower()]
    def by_church(self,c): return [copy.deepcopy(p) for p in self.store.values() if p['churchId']==c]
    def by_zone(self,z): return [copy.deepcopy(p) for p in self.store.values() if p['zone']==z]
    def by_group(self,g): return [copy.deepcopy(p) for p in self.store.values() if p.get('groupId')==g]
    def by_kind(self,k): return [copy.deepcopy(p) for p in self.store.values() if p['kind']==k]
    def by_lifecycle(self,l): return [copy.deepcopy(p) for p in self.store.values() if p['lifecycle']==l]
    def campers(self): return [copy.deepcopy(p) for p in self.store.values() if p['lifecycle'] in AT_CAMP]
    def at_camp(self): return [copy.deepcopy(p) for p in self.store.values() if p['atCamp']]
    def delete_all(self):
        n=len(self.store); self.store={}; return n

def P(**o):
    base=dict(id='p',firstName='Ada',lastName='Lovelace',gender='female',kind='youth',
        churchId='c1',churchName='V',zone='Yellow',lifecycle='registered',atCamp=False,groupId=None)
    base.update(o); return base

r=Repo()
for p in [
    P(id='p1',firstName='Ada',lastName='Byron',churchId='c1',zone='Yellow',kind='youth',lifecycle='registered',atCamp=False),
    P(id='p2',firstName='Grace',lastName='Hopper',churchId='c1',zone='Yellow',kind='youth',lifecycle='arrived',atCamp=True,groupId='g1'),
    P(id='p3',firstName='Alan',lastName='Turing',churchId='c2',zone='Blue',kind='leader',lifecycle='checked_out',atCamp=False),
    P(id='p4',firstName='Edsger',lastName='Dijkstra',churchId='c2',zone='Blue',kind='youth',lifecycle='cancelled',atCamp=False),
]: r.save(p)

ids=lambda lst: sorted(p['id'] for p in lst)
idl=lambda lst:[p['id'] for p in lst]
T=[]; F=lambda c,m:T.append((c,m))

F(idl(r.search('grace'))==['p2'],"search grace")
F(idl(r.search('turing'))==['p3'],"search turing")
F(idl(r.search('ada byron'))==['p1'],"search full name")
F(ids(r.by_church('c1'))==['p1','p2'],"by church c1")
F(ids(r.by_zone('Blue'))==['p3','p4'],"by zone Blue")
F(idl(r.by_group('g1'))==['p2'],"by group g1")
F(idl(r.by_kind('leader'))==['p3'],"by kind leader")
F(ids(r.by_kind('youth'))==['p1','p2','p4'],"by kind youth")
F(idl(r.by_lifecycle('registered'))==['p1'],"by lifecycle registered")
F(idl(r.by_lifecycle('cancelled'))==['p4'],"by lifecycle cancelled")
F(ids(r.campers())==['p2','p3'],"findCampers arrived+checked_out")
F(idl(r.at_camp())==['p2'],"findAtCamp flag")
# clone semantics
a=r.find_by_id('p1'); a['firstName']='MUTATED'; b=r.find_by_id('p1')
F(b['firstName']=='Ada',"reads are clones")
# deleteAll
n=r.delete_all(); F(n==4,"deleteAll returns 4"); F(r.find_all()==[],"store empty after deleteAll"); F(r.delete_all()==0,"deleteAll again returns 0")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions mirrored from person.repository.test.ts")
print("✓ ALL PASS — repo impl and test self-consistent" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
