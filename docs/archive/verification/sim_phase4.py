# Port of the stateless HMAC session (auth.service) + RateLimiter, vs their tests.
import hmac, hashlib, json, base64, time
SECRET=b'camp-platform-dev-secret-change-in-production'
def b64url(b): return base64.urlsafe_b64encode(b).decode().rstrip('=')
def b64url_dec(s):
    pad='='*(-len(s)%4); return base64.urlsafe_b64decode(s+pad)
def sign(actor, exp):
    payload=b64url(json.dumps({'userId':actor['id'],'expiresAt':exp,'actor':actor},separators=(',',':')).encode())
    sig=b64url(hmac.new(SECRET,payload.encode(),hashlib.sha256).digest())
    return f"{payload}.{sig}"
def parse(token):
    dot=token.rfind('.')
    if dot==-1: return None
    payload,sig=token[:dot],token[dot+1:]
    exp=b64url(hmac.new(SECRET,payload.encode(),hashlib.sha256).digest())
    if not hmac.compare_digest(sig,exp): return None
    try: return json.loads(b64url_dec(payload))
    except: return None
def resolve(token):
    s=parse(token)
    if not s: return None
    if time.time()*1000 > s['expiresAt']: return None
    return s.get('actor')

T=[];F=lambda c,m:T.append((c,m))
actor={'id':'u1','role':'admin','displayName':'Ada Admin','churchId':None,'churchName':None,'zone':None}
tok=sign(actor, int(time.time()*1000)+12*3600*1000)
# token shape: payload.sig (base64url . base64url)
import re
F(bool(re.match(r'^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$',tok)),"token is payload.sig base64url")
# resolve round-trips embedded actor, no DB
r=resolve(tok); F(r and r['role']=='admin' and r['displayName']=='Ada Admin',"resolve embedded actor")
# logout no-op: token still valid
F(resolve(tok) is not None,"logout no-op (still valid)")
# malformed
F(resolve('deadbeef') is None,"malformed -> null")
# tampered payload, original sig
forged=b64url(json.dumps({'userId':'u1','expiresAt':int(time.time()*1000)+1e6,'actor':{'id':'u1','role':'admin'}}).encode())+'.'+tok.split('.')[1]
F(resolve(forged) is None,"tampered payload rejected by HMAC")
# expired
exp_tok=sign(actor, int(time.time()*1000)-1000)
F(resolve(exp_tok) is None,"expired -> null")

# RateLimiter
class RL:
    def __init__(s,maxa,win): s.max=maxa; s.win=win; s.b={}
    def blocked(s,k):
        now=time.time()*1000; bk=s.b.get(k)
        if not bk or now>bk['resetAt']: s.b[k]={'count':1,'resetAt':now+s.win}; return False
        bk['count']+=1; return bk['count']>s.max
    def retry(s,k):
        bk=s.b.get(k)
        if not bk: return 0
        import math; return math.ceil(max(0,bk['resetAt']-time.time()*1000)/1000)
rl=RL(3,60000)
F([rl.blocked('ip1') for _ in range(5)]==[False,False,False,True,True],"allows 3 blocks 4th+")
rl2=RL(1,60000); F(rl2.blocked('a')==False and rl2.blocked('a')==True and rl2.blocked('b')==False,"per-key buckets")
rl3=RL(1,60000); F(rl3.retry('unknown')==0,"retry 0 unknown"); rl3.blocked('x'); F(0<rl3.retry('x')<=60,"retry positive bounded")
rl4=RL(1,0); F(rl4.blocked('k')==False and rl4.blocked('k')==False,"zero window never blocks")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions (auth stateless sessions + RateLimiter Phase 4)")
print("✓ ALL PASS — Phase 4 impl and tests self-consistent" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
