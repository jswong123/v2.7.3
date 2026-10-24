import json,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parents[2]
r=json.loads((pathlib.Path(__file__).parent/'melbourne-expansion-registry.json').read_text(encoding='utf-8'))
c=(root/'data/campaigns.js').read_text(encoding='utf-8')
issues=[]
for e in r['existing']:
 i=e['id']
 if not re.search(r'id\s*:\s*["\']'+re.escape(i)+r'["\']',c):issues.append('Missing campaign registration: '+i)
 dirs={'werribee_1943':'werribee_1943','melbourne_1943':'melbourne','melbourne_cbd_1943':'melbourne-cbd'}
 names={'werribee_1943':'werribee_1943','melbourne_1943':'melbourne','melbourne_cbd_1943':'melbourne-cbd'}
 for kind in ('scenario','units'):
  p=root/'data/interface-scenarios'/dirs[i]/(kind+'-'+names[i]+'.json')
  if not p.exists():issues.append('Missing '+str(p))
  else:
   try:json.loads(p.read_text(encoding='utf-8'))
   except Exception as ex:issues.append('Invalid JSON '+str(p)+': '+str(ex))
for p in r['planned']:
 if re.search(r'id\s*:\s*["\']'+re.escape(p['id'])+r'["\']',c):issues.append('Planned ID already registered: '+p['id'])
print('Australia interface check:', 'PASS' if not issues else 'FAIL')
print('Existing:',len(r['existing']),'Planned:',len(r['planned']))
for i in issues:print('ERROR:',i)
sys.exit(bool(issues))
