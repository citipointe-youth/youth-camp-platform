import re, os
SRC = os.path.join(os.getcwd(), 'src')
def read(p):
    with open(p, encoding='utf-8') as f: return f.read()

# Parse enum member sets from enums.ts
enum_txt = read(os.path.join(SRC,'core/types/enums.ts'))
ENUMS = {}  # type name -> set(members)
for m in re.finditer(r"export const ([A-Z_]+) = \[([^\]]+)\] as const;\s*\nexport type (\w+)", enum_txt):
    members = set(re.findall(r"'([^']+)'", m.group(2)))
    ENUMS[m.group(3)] = members
print("Enum types parsed:", {k:sorted(v) for k,v in ENUMS.items() if k in ('PersonKind','PersonLifecycle','Gender','PaymentStatus','ScheduleItemType','AccommodationKind','ZoneName','CamperStatus')})

# Validate person.ts lifecycle/kind literals against the enums
person = read(os.path.join(SRC,'core/entities/person.ts'))
issues = []
# lifecycle literals assigned (e.g. lifecycle: 'arrived')
for lit in re.findall(r"lifecycle:\s*'([^']+)'", person) + re.findall(r"=>\s*'([^']+)'", person):
    pass
# Check AT_CAMP_LIFECYCLES members
atcamp = re.search(r"AT_CAMP_LIFECYCLES[^=]*=\s*\[([^\]]+)\]", person)
if atcamp:
    for lit in re.findall(r"'([^']+)'", atcamp.group(1)):
        if lit not in ENUMS['PersonLifecycle']:
            issues.append(f"person.ts AT_CAMP_LIFECYCLES: '{lit}' not a PersonLifecycle")

# Check every 'xxx' compared/assigned to status/lifecycle in person mappers
for lit in re.findall(r"c\.status === '([^']+)'", person):
    if lit not in ENUMS['CamperStatus']:
        issues.append(f"person.ts: camper status literal '{lit}' not a CamperStatus")
for lit in re.findall(r"lifecycle:\s*PersonLifecycle\s*=|: PersonLifecycle =", person):
    pass

# seed.ts: check literal enum-typed fields
seed = read(os.path.join(SRC,'data/seed.ts'))
checks = {
    "zone:\\s*'([^']+)'": 'ZoneName',
    "role:\\s*'([^']+)'": None,  # UserRole - check separately
    "kind:\\s*'([^']+)'": 'AccommodationKind',
    "type:\\s*'([^']+)'": 'ScheduleItemType',
    "campMode:\\s*'([^']+)'": 'CampMode',
    "status:\\s*'([^']+)'": None,
}
USER_ROLES = ENUMS.get('UserRole', set())
for lit in re.findall(r"role:\s*'([^']+)'", seed):
    if lit not in USER_ROLES: issues.append(f"seed.ts: role '{lit}' not a UserRole {sorted(USER_ROLES)}")
for lit in re.findall(r"zone:\s*'([^']+)'", seed):
    if lit not in ENUMS['ZoneName']: issues.append(f"seed.ts: zone '{lit}' not a ZoneName")
for lit in re.findall(r"^\s*kind:\s*'([^']+)'", seed, re.M):
    if lit not in ENUMS['AccommodationKind']: issues.append(f"seed.ts: accommodation kind '{lit}' invalid")
for lit in re.findall(r"^\s*type:\s*'([^']+)'", seed, re.M):
    if lit not in ENUMS['ScheduleItemType']: issues.append(f"seed.ts: schedule type '{lit}' invalid")
for lit in re.findall(r"campMode:\s*'([^']+)'", seed):
    if lit not in ENUMS['CampMode']: issues.append(f"seed.ts: campMode '{lit}' invalid")

print("\n"+ ("\n".join("  ✗ "+i for i in issues) if issues else "✓ All enum-typed string literals in person.ts + seed.ts are valid members."))
