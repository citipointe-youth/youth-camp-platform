# Port of the fixed at-camp dashboard logic, vs dashboard.service.test.ts assertions.
def can_access(actor, c):
    r=actor['role']
    if r in('admin','director'): return True
    if r=='zoneLeader': return actor.get('zone') is not None and c['zone']==actor.get('zone')
    if r=='church': return actor.get('churchId')==c['churchId']
    return False

def home_atcamp(actor, campers, sessions, now_time):
    scoped=[c for c in campers if can_access(actor,c)]
    total_at_camp=len([c for c in scoped if c['atCamp']])
    total_expected=len([c for c in scoped if c['status']!='cancelled'])
    today=sorted(sessions, key=lambda s:s['startTime'])  # ascending
    # D1: latest started
    current=None
    for s in reversed(today):
        if s['startTime']<=now_time: current=s; break
    nxt=next((s for s in today if s['startTime']>now_time), None)
    # D3: due vs current session, respecting checkout
    if current:
        due=0
        for c in scoped:
            if c['status']=='cancelled': continue
            entries=[e for e in c['checkInHistory'] if e['sessionId']==current['id']]
            last=entries[-1] if entries else None
            if not last or last['type']!='in': due+=1
    else:
        due=0
    return dict(totalAtCamp=total_at_camp, totalExpected=total_expected,
                currentSession=current['id'] if current else None,
                nextSession=nxt['id'] if nxt else None, checkInsDue=due)

def C(id,churchId='c1',zone='Yellow',atCamp=False,status='registered',hist=None):
    return dict(id=id,churchId=churchId,zone=zone,atCamp=atCamp,status=status,checkInHistory=hist or [])
def S(id,st): return dict(id=id,startTime=st)
def E(sid,t): return dict(sessionId=sid,type=t)
A=lambda role,**o: dict(role=role,**o)
NOW='12:00'  # both 00:00 and 00:01 started; 23:59 not
T=[];F=lambda c,m:T.append((c,m))

# D1
r=home_atcamp(A('admin'),[],[S('am','00:00'),S('pm','00:01')],NOW); F(r['currentSession']=='pm',"D1 current=pm (latest started)")
r=home_atcamp(A('admin'),[],[S('past','00:00'),S('future','23:59')],NOW); F(r['nextSession']=='future' and r['currentSession']=='past',"D1 next=future")
# D2
camps=[C('c1a','c1',atCamp=True),C('c1b','c1',atCamp=False),C('c2a','c2',atCamp=True)]
r=home_atcamp(A('church',churchId='c1'),camps,[],NOW); F(r['totalExpected']==2 and r['totalAtCamp']==1,"D2 church scoped")
r=home_atcamp(A('admin'),camps,[],NOW); F(r['totalExpected']==3 and r['totalAtCamp']==2,"D2 admin all")
r=home_atcamp(A('admin'),[C('live'),C('gone',status='cancelled')],[],NOW); F(r['totalExpected']==1,"D2 excludes cancelled")
# D3
r=home_atcamp(A('admin'),[C('x')],[S('cur','00:00')],NOW); F(r['checkInsDue']==1,"D3 never-in due")
r=home_atcamp(A('admin'),[C('x',hist=[E('cur','in')])],[S('cur','00:00')],NOW); F(r['checkInsDue']==0,"D3 in -> not due")
r=home_atcamp(A('admin'),[C('x',hist=[E('cur','in'),E('cur','out')])],[S('cur','00:00')],NOW); F(r['checkInsDue']==1,"D3 in-then-out -> due")
r=home_atcamp(A('admin'),[C('x',hist=[E('am','in')])],[S('am','00:00'),S('pm','00:01')],NOW); F(r['currentSession']=='pm' and r['checkInsDue']==1,"D3 other-session in doesn't satisfy current")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions (dashboard D1/D2/D3)")
print("✓ ALL PASS" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
