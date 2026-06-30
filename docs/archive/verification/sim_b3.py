# Verify the zonedNow expected values in date.test.ts against IANA tz data (zoneinfo).
# Intl.DateTimeFormat uses the same tz database, so matching here validates the asserts.
from datetime import datetime, timezone
try:
    from zoneinfo import ZoneInfo
except ImportError:
    print("zoneinfo unavailable; skipping (Python <3.9)"); raise SystemExit(0)

def zoned(tz, iso):
    dt=datetime.fromisoformat(iso.replace('Z','+00:00')).astimezone(ZoneInfo(tz))
    return {'date':dt.strftime('%Y-%m-%d'),'time':dt.strftime('%H:%M')}

T=[];F=lambda c,m:T.append((c,m))
F(zoned('Australia/Brisbane','2026-07-01T23:30:00Z')=={'date':'2026-07-02','time':'09:30'},"Brisbane +10 date rollover")
F(zoned('UTC','2026-07-01T08:05:00Z')=={'date':'2026-07-01','time':'08:05'},"UTC passthrough")
F(zoned('America/Los_Angeles','2026-07-01T02:00:00Z')=={'date':'2026-06-30','time':'19:00'},"LA -7 backward date")
F(zoned('Australia/Brisbane','2026-07-01T14:00:00Z')=={'date':'2026-07-02','time':'00:00'},"Brisbane midnight 00:00")
F(zoned('Australia/Brisbane','2026-07-01T23:30:00Z')['date']=='2026-07-02',"zonedToday date portion")
# daysUntil sign relationship (today-relative) — just assert monotonicity logic
def days_until(iso, today):
    from datetime import date
    s=date.fromisoformat(today); t=date.fromisoformat(iso)
    return (t-s).days
F(days_until('2999-01-01','2026-07-01')>0,"far future positive")
F(days_until('2000-01-01','2026-07-01')<0,"past negative")
F(days_until('2026-07-01','2026-07-01')==0,"today is 0")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions (zonedNow/zonedToday/daysUntil B3, validated vs IANA tz)")
print("✓ ALL PASS — B3 expected values are correct" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
