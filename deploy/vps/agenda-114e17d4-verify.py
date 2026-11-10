import base64,json,subprocess,urllib.request,urllib.error
from pathlib import Path

def inspect(name):return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
def env(meta):return dict(e.split('=',1) for e in meta['Config']['Env'] if '=' in e)
old=json.loads(Path('/opt/grupo-security/releases/agenda-114e17d4/original-containers.json').read_text())['api']
api=inspect('gs-api'); expected=Path('/tmp/gs-production-crypto-probe-114e17d-v3/release/normalized.env').read_text().strip().split('=',1)[1]
def mounts(meta):return sorted((m['Type'],m.get('Name',''),m['Source'],m['Destination'],m['RW']) for m in meta['Mounts'])
result={'mfaKeyMatchesAuthenticatedExistingEntry':env(api).get('MFA_ENCRYPTION_KEY')==expected,'mfaKeyValid32Bytes':len(base64.b64decode(env(api).get('MFA_ENCRYPTION_KEY',''),validate=True))==32,'databaseJwtCorsPreserved':all(env(api).get(k)==env(old).get(k) for k in ['DATABASE_URL','JWT_SECRET','CORS_ORIGIN']),'uploadsAndImportsMountsPreserved':mounts(api)==mounts(old),'apiHealthy':api['State']['Health']['Status']=='healthy','apiRestarts':api['RestartCount']}
for path,label in [('/','publicRoot'),('/agenda','publicAgenda'),('/api/health','publicApiHealth'),('/api/users','publicUsersWithoutSession')]:
 try:
  with urllib.request.urlopen('https://dev.gruposecurity.cloud'+path,timeout=10) as r:result[label]=r.status
 except urllib.error.HTTPError as e:result[label]=e.code
print(json.dumps(result))
if not all(result[k] for k in ['mfaKeyMatchesAuthenticatedExistingEntry','mfaKeyValid32Bytes','databaseJwtCorsPreserved','uploadsAndImportsMountsPreserved','apiHealthy']) or result['apiRestarts'] or result['publicRoot']!=200 or result['publicAgenda']!=200 or result['publicApiHealth']!=200 or result['publicUsersWithoutSession'] not in (401,403):raise SystemExit(1)
