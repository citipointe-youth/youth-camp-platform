# Port of accommodation-occupancy.ts + the listBlocks/getBlock B1-fix logic,
# run against accommodation-occupancy.test.ts + the updated characterisation asserts.
def compute_live_taken(blocks, occupants):
    taken={b['id']:b['baseTaken'] for b in blocks}
    for o in occupants:
        if o.get('status')=='cancelled': continue
        if not o.get('accommodationLabel'): continue
        for b in blocks:
            if b['kind']==o.get('accommodationKind') and b['name']==o.get('accommodationLabel'):
                taken[b['id']]=taken.get(b['id'],0)+1; break
    return taken
def live_taken_for_block(b,occ): return compute_live_taken([b],occ).get(b['id'],b['baseTaken'])
def available_for_block(b,lt): return b['capacity']-lt

def B(id='b',kind='tent',name='Tent A',capacity=10,baseTaken=0): return dict(id=id,kind=kind,name=name,capacity=capacity,baseTaken=baseTaken,price=100)
def O(kind='tent',label='Tent A',status='registered'): return dict(accommodationKind=kind,accommodationLabel=label,status=status)

# getLiveBlocks port (the service path)
def get_live_blocks(blocks,registrants):
    taken=compute_live_taken(blocks,registrants)
    return [{**b,'liveTaken':taken.get(b['id'],b['baseTaken']),'available':available_for_block(b,taken.get(b['id'],b['baseTaken']))} for b in blocks]
def get_block(block,registrants):
    lt=compute_live_taken([block],registrants).get(block['id'],block['baseTaken'])
    return {**block,'liveTaken':lt,'available':available_for_block(block,lt)}

T=[];F=lambda c,m:T.append((c,m))
# occupancy module tests
F(compute_live_taken([B(id='b1',baseTaken=4)],[]).get('b1')==4,"seeds baseTaken")
blocks=[B(id='b1',kind='tent',name='Tent A',baseTaken=1),B(id='b2',kind='classroom',name='Room 1',baseTaken=0)]
occ=[O('tent','Tent A'),O('tent','Tent A'),O('classroom','Room 1','cancelled'),O('classroom','Room 1'),O('tent','No Such'),O(None,None)]
t=compute_live_taken(blocks,occ); F(t['b1']==3,"b1=3"); F(t['b2']==1,"b2=1 cancelled skipped")
F(compute_live_taken([B(id='b1',kind='tent',name='Shared')],[O('classroom','Shared')]).get('b1')==0,"wrong kind no match")
t=compute_live_taken([B(id='b1',kind='tent',name='Tent A'),B(id='b2',kind='tent',name='Tent A')],[O('tent','Tent A')]); F(t['b1']==1 and t['b2']==0,"first match only")
F(live_taken_for_block(B(id='b1',kind='tent',name='Tent A',baseTaken=2),[O(),O()])==4,"liveTakenForBlock")
F(available_for_block(B(capacity=10),7)==3,"available 3"); F(available_for_block(B(capacity=5),8)==-3,"available -3 no clamp")
# characterisation (B1 fix) asserts
lb=get_live_blocks([B(id='b1',kind='tent',name='Tent A',capacity=10,baseTaken=3)],[O('tent','Tent A'),O('tent','Tent A')])
F(lb[0]['liveTaken']==5 and lb[0]['available']==5,"listBlocks subtracts occupants (reservations NOT counted)")
lb=get_live_blocks([B(id='b1',kind='tent',name='Tent A',capacity=10,baseTaken=0)],[O('tent','Tent A'),O('tent','Tent A','cancelled'),O('tent','No Such'),O(None,None)])
F(lb[0]['liveTaken']==1 and lb[0]['available']==9,"listBlocks ignores cancelled/nonmatch")
lb=get_live_blocks([B(id='b1',kind='tent',name='Tent A',capacity=10,baseTaken=0)],[]); F(lb[0]['liveTaken']==0 and lb[0]['available']==10,"no registrants=baseTaken")
lb=get_live_blocks([B(id='b1',capacity=5,baseTaken=8)],[]); F(lb[0]['available']==-3,"negative available")
gb=get_block(B(id='b1',capacity=12,baseTaken=2),[]); F(gb['liveTaken']==2 and gb['available']==10,"getBlock no occupants")
gb=get_block(B(id='b1',kind='tent',name='Tent A',capacity=12,baseTaken=2),[O('tent','Tent A')]); F(gb['liveTaken']==3 and gb['available']==9,"getBlock with occupant")

fails=[m for c,m in T if not c]
print(f"Ran {len(T)} assertions (accommodation-occupancy.test.ts + accommodation char. B1 asserts)")
print("✓ ALL PASS — B1 fix impl and tests self-consistent" if not fails else "✗ FAILURES:\n  "+"\n  ".join(fails))
