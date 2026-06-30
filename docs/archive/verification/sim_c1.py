# Port of the rewritten phone-aware importCsv, vs import.service.test.ts assertions.
import re, itertools
_id=itertools.count(1)
def new_id(): return f"camper_{next(_id)}"
def parse_csv(s):
    lines=[l for l in s.split('\n') if l.strip()!='']
    if len(lines)<2: return []
    hdr=[h.strip() for h in lines[0].split(',')]
    return [{hdr[i]:(v[i].strip() if i<len(v) else '') for i in range(len(hdr))} for v in (l.split(',') for l in lines[1:])]
def parse_grade(v):
    try: n=int(v)
    except: return None
    return n if n in (7,8,9,10,11,12) else None
def phone_key(m): return re.sub(r'\D','',m or '')

class Repo:
    def __init__(s): s.d={}
    def all(s): return list(s.d.values())
    def save_many(s,ents):
        for e in ents: s.d[e['id']]=dict(e)

def import_csv(role, opts, repo, churches):
    if role not in ('admin','director'): raise PermissionError
    rows=parse_csv(opts['csvData'])
    if not rows: raise ValueError("BadRequest")
    created=updated=skipped=0; errors=[]
    church_by_name={c['name'].lower():c['id'] for c in churches}
    nck=lambda cid,f,l: f"{cid}::{f.lower()}::{l.lower()}"
    pool={}
    for c in repo.all(): pool.setdefault(nck(c['churchId'],c['firstName'],c['lastName']),[]).append(dict(c))
    def pick(p,phone):
        if not p: return None
        if phone:
            bp=next((c for c in p if phone_key(c.get('mobile'))==phone),None)
            if bp: return bp
            if len(p)==1 and not phone_key(p[0].get('mobile')): return p[0]
            return None
        return p[0] if len(p)==1 else None
    touched={}; created_ids=set()
    for i,row in enumerate(rows):
        first=(row.get('First Name') or '').strip(); last=(row.get('Last Name') or '').strip()
        if not first or not last: errors.append({'row':i+2}); skipped+=1; continue
        cid=church_by_name.get((row.get('Church','') or '').lower(),'')
        grade=parse_grade(row.get('Grade','')); mobile=(row.get('Mobile','') or '').strip() or None
        k=nck(cid,first,last); rowphone=phone_key(mobile)
        p=pool.get(k); match=pick(p,rowphone)
        is_existing = match is not None and match['id'] not in created_ids
        if match and is_existing and not opts.get('updateExisting'):
            skipped+=1
        elif match:
            merged=dict(match); merged.update(firstName=first,lastName=last,grade=grade,mobile=mobile or match.get('mobile'))
            idx=p.index(match); p[idx]=merged
            first_touch = merged['id'] not in touched
            touched[merged['id']]=merged
            if is_existing and first_touch: updated+=1
        else:
            c=dict(id=new_id(),firstName=first,lastName=last,grade=grade,mobile=mobile,churchId=cid)
            touched[c['id']]=c; created_ids.add(c['id'])
            pool.setdefault(k,[]).append(c); created+=1
    if touched: repo.save_many(list(touched.values()))
    return dict(created=created,updated=updated,skipped=skipped,errors=errors)

CH=[{'id':'c1','name':'Victory'}]; A=lambda r:{'role':r} if False else r
T=[];F=lambda c,m:T.append((c,m))
# original C1 cases
r=Repo(); res=import_csv('admin',{'csvData':'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,9\nGrace,Hopper,Victory,8'},r,CH)
F(res['created']==2 and res['updated']==0,"create 2")
r=Repo(); res=import_csv('admin',{'csvData':'First Name,Last Name,Church\nAda,,Victory\nGrace,Hopper,Victory'},r,CH)
F(res['created']==1 and res['skipped']==1 and len(res['errors'])==1,"missing-name")
r=Repo(); res=import_csv('admin',{'csvData':'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,9\nAda,Lovelace,Victory,11'},r,CH)
F(res['created']==1 and r.all()[0]['grade']==11,"in-file dedup last wins")
r=Repo(); import_csv('admin',{'csvData':'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,9'},r,CH)
res=import_csv('admin',{'csvData':'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,12'},r,CH)
F(res['skipped']==1 and r.all()[0]['grade']==9,"updateExisting=false skip")
r=Repo(); import_csv('admin',{'csvData':'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,9'},r,CH)
res=import_csv('admin',{'csvData':'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,12','updateExisting':True},r,CH)
F(res['updated']==1 and r.all()[0]['grade']==12,"updateExisting=true update")
# phone disambiguation
r=Repo(); res=import_csv('admin',{'csvData':'First Name,Last Name,Church,Mobile,Grade\nSam,Lee,Victory,0400 111 111,9\nSam,Lee,Victory,0400 222 222,11'},r,CH)
F(res['created']==2 and len(r.all())==2,"two twins diff phone -> 2 created")
r=Repo(); res=import_csv('admin',{'csvData':'First Name,Last Name,Church,Mobile,Grade\nSam,Lee,Victory,0400 111 111,9\nSam,Lee,Victory,0400111111,11'},r,CH)
F(res['created']==1 and len(r.all())==1 and r.all()[0]['grade']==11,"same phone diff format -> 1")
r=Repo(); import_csv('admin',{'csvData':'First Name,Last Name,Church,Mobile,Grade\nAda,Lovelace,Victory,0400 999 999,9'},r,CH)
res=import_csv('admin',{'csvData':'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,12','updateExisting':True},r,CH)
F(res['created']==0 and res['updated']==1 and r.all()[0]['grade']==12,"single existing updates w/o phone")
r=Repo(); import_csv('admin',{'csvData':'First Name,Last Name,Church,Mobile,Grade\nSam,Lee,Victory,0400 111 111,9\nSam,Lee,Victory,0400 222 222,9'},r,CH)
res=import_csv('admin',{'csvData':'First Name,Last Name,Church,Mobile,Grade\nSam,Lee,Victory,0400 222 222,12','updateExisting':True},r,CH)
twins={phone_key(c['mobile']):c['grade'] for c in r.all()}
F(res['updated']==1 and len(r.all())==2 and twins['0400111111']==9 and twins['0400222222']==12,"phone-matched twin updated, other untouched")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions (import phone-aware C1)")
print("✓ ALL PASS" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
