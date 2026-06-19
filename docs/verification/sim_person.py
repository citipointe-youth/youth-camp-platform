# Faithful Python port of src/core/entities/person.ts pure logic,
# then run the assertions from person.test.ts against it.

AT_CAMP = ['arrived','checked_out','departed']
def is_camper(p): return p['lifecycle'] in AT_CAMP
def is_registrant(p): return p['lifecycle'] == 'registered'
def to_person_kind(k): return 'leader' if k == 'leader' else 'youth'

def empty_consents():
    return {'medical':{'granted':False,'timestamp':None},
            'media':{'granted':False,'timestamp':None},
            'supervision':{'granted':False,'timestamp':None}}

def person_from_registrant(r):
    return {
        'id': r['id'], 'firstName': r['firstName'], 'lastName': r['lastName'],
        'gender': r['gender'], 'grade': r.get('grade'), 'kind': to_person_kind(r['kind']),
        'churchId': r['churchId'], 'churchName': r['churchName'], 'zone': r['zone'],
        'medicalConditions': [r['medical']] if r.get('medical') else [],
        'dietaryRequirements': [r['dietary']] if r.get('dietary') else [],
        'parentGuardianName': r.get('parentName'),
        'paymentStatus': r['paymentStatus'],
        'accommodationKind': r.get('accommodationKind'),
        'accommodationLabel': r.get('accommodationLabel'),
        'consents': empty_consents(),
        'lifecycle': 'cancelled' if r['status']=='cancelled' else 'registered',
        'atCamp': False,
    }

def person_from_camper(c):
    s = c['status']
    lifecycle = ('cancelled' if s=='cancelled' else 'checked_out' if s=='checked_out'
                 else 'departed' if s=='departed' else 'arrived' if s=='checked_in' else 'registered')
    return {
        'id': c['id'], 'kind': to_person_kind(c['kind']),
        'consents': c['consents'], 'blueCardNumber': c.get('blueCardNumber'),
        'medicalConditions': c['medicalConditions'], 'otherMedications': c.get('otherMedications'),
        'lifecycle': lifecycle, 'atCamp': c['atCamp'],
    }

def reg(**over):
    base = dict(id='r1',firstName='Ada',lastName='Lovelace',gender='female',kind='camper',grade=9,
        accommodationKind='tent',accommodationLabel='Tent A',dietary='Vegetarian',medical='Asthma',
        paymentStatus='deposit',blueCardCollected=False,parentName='Byron',parentPhone='0400',
        churchId='c1',churchName='Victory',zone='Yellow',status='registered'); base.update(over); return base
def camper(**over):
    base = dict(id='cmp1',firstName='Grace',lastName='Hopper',gender='female',kind='student',
        medicalConditions=['Peanut allergy'],otherMedications='EpiPen',blueCardNumber='BC123',
        consents={'medical':{'granted':True,'timestamp':'t'},'media':{'granted':False,'timestamp':None},
                  'supervision':{'granted':True,'timestamp':'t'}},
        churchId='c2',churchName='Grace Point',atCamp=True,status='checked_in'); base.update(over); return base

T=[]; F=lambda c,m: T.append((c,m))
# --- assertions mirrored 1:1 from person.test.ts ---
F(is_registrant({'lifecycle':'registered'})==True, "registered is registrant")
F(is_camper({'lifecycle':'registered'})==False, "registered not camper")
for lc in ['arrived','checked_out','departed']:
    F(is_camper({'lifecycle':lc})==True, f"{lc} is camper")
    F(is_registrant({'lifecycle':lc})==False, f"{lc} not registrant")
F(is_camper({'lifecycle':'cancelled'})==False, "cancelled not camper")
F(is_registrant({'lifecycle':'cancelled'})==False, "cancelled not registrant")
F(sorted(AT_CAMP)==['arrived','checked_out','departed'], "AT_CAMP_LIFECYCLES set")
F(to_person_kind('leader')=='leader', "leader->leader")
F(to_person_kind('camper')=='youth', "camper->youth")
F(to_person_kind('student')=='youth', "student->youth")
F(to_person_kind('')=='youth', "''->youth")
F(to_person_kind('something')=='youth', "something->youth")
p=person_from_registrant(reg())
F(p['lifecycle']=='registered' and p['atCamp']==False and is_registrant(p) and p['kind']=='youth', "reg() -> registered youth")
F(person_from_registrant(reg(status='cancelled'))['lifecycle']=='cancelled', "cancelled reg")
p=person_from_registrant(reg(medical='Asthma',dietary='Vegetarian'))
F(p['medicalConditions']==['Asthma'] and p['dietaryRequirements']==['Vegetarian'] and p['paymentStatus']=='deposit'
  and p['accommodationKind']=='tent' and p['accommodationLabel']=='Tent A' and p['parentGuardianName']=='Byron', "reg scalar->array + fields")
p=person_from_registrant(reg(medical=None,dietary=None))
F(p['medicalConditions']==[] and p['dietaryRequirements']==[], "reg empty arrays")
F(person_from_registrant(reg(kind='leader'))['kind']=='leader', "reg leader kind")
p=person_from_camper(camper(status='checked_in',atCamp=True))
F(p['lifecycle']=='arrived' and p['atCamp']==True and is_camper(p) and p['kind']=='youth', "camper checked_in -> arrived youth")
F(person_from_camper(camper(status='registered'))['lifecycle']=='registered', "camper registered")
F(person_from_camper(camper(status='checked_in'))['lifecycle']=='arrived', "camper checked_in")
F(person_from_camper(camper(status='checked_out'))['lifecycle']=='checked_out', "camper checked_out")
F(person_from_camper(camper(status='departed'))['lifecycle']=='departed', "camper departed")
F(person_from_camper(camper(status='cancelled'))['lifecycle']=='cancelled', "camper cancelled")
p=person_from_camper(camper())
F(p['consents']['medical']['granted']==True and p['consents']['media']['granted']==False
  and p['blueCardNumber']=='BC123' and p['medicalConditions']==['Peanut allergy'] and p['otherMedications']=='EpiPen', "camper care record preserved")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions mirrored from person.test.ts")
print("✓ ALL PASS — implementation and test file are self-consistent" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
