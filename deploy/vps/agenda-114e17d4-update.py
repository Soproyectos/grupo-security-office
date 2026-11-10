#!/usr/bin/env python3
import base64,hashlib,json,os,re,subprocess,time,urllib.request,urllib.error
from pathlib import Path
ROOT=Path('/opt/grupo-security')
STATE=ROOT/'releases/agenda-114e17d4'
TAG='114e17d4'
OLDTAG='pre-agenda-114e17d4'
REG='ghcr.io/soproyectos/grupo-security-office/'
SOURCES={'api':'sha256:7950299c883609baa8f9da40a36541689bf7048c0adc82fb77a3351dae9330f7','frontend':'sha256:14b43292458a60054c1e4fdfcbc12e3f95dae2bedecdbbb6507cef235c1acd77'}
FILES=[(Path('/tmp/agenda-prod-compose.yml'),ROOT/'docker-compose.prod.yml','b733813d4c694c15481194fcc59e155dd2b4ea5e62268da25922d24f676caf0d'),(Path('/tmp/agenda-prod-override.yml'),ROOT/'deploy/vps/docker-compose.override.yml','bee0ed28b6d45066437ed15213450bb41cc98a44b4b2c849ba3a62e001d0f7eb')]
NORMAL=Path('/tmp/gs-production-crypto-probe-114e17d-v3/release/normalized.env')
class Failure(Exception):pass

def run(args,data=None,out=None,timeout=60,env=None,check=True):
 p=subprocess.run(args,input=data,stdout=out or subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,env=env)
 if check and p.returncode:raise Failure('command_failed_'+args[0])
 return p

def docker(*args,**kw):return run(['docker',*map(str,args)],**kw)
def inspect(name):return json.loads(docker('inspect',name).stdout)[0]
def private(path,data):
 fd=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data)
def compose(tag,*args):
 env=dict(os.environ,IMAGE_TAG=tag)
 return run(['docker','compose','--env-file',str(ROOT/'.env'),'-p','grupo-security','-f',str(FILES[0][1]),'-f',str(FILES[1][1]),*args],env=env,timeout=220)
def config(tag):return json.loads(compose(tag,'config','--format','json').stdout)
def envdict(meta):return dict(x.split('=',1) for x in meta['Config'].get('Env',[]) if '=' in x)
def update_env(key,tag):
 text=(ROOT/'.env').read_text()
 lines=[x for x in text.splitlines() if not re.match(r'^\s*(?:export\s+)?(?:MFA_ENCRYPTION_KEY|IMAGE_TAG)\s*=',x)]
 lines+=['MFA_ENCRYPTION_KEY='+key,'IMAGE_TAG='+tag]
 with (ROOT/'.env').open('w') as f:f.write('\n'.join(lines)+'\n');f.flush();os.fsync(f.fileno())
def http(url):
 try:
  with urllib.request.urlopen(url,timeout=8) as r:return r.status,r.read()
 except urllib.error.HTTPError as e:return e.code,b''
 except Exception:return None,b''
def check_health(timeout=180):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  try:
   a=inspect('gs-api');w=inspect('gs-frontend')
   if a['State'].get('Health',{}).get('Status')=='healthy' and w['State'].get('Health',{}).get('Status')=='healthy':
    status,body=http('http://127.0.0.1:3001/api/health');j=json.loads(body);j=j.get('data',j)
    if status==200 and j.get('status')=='ok' and j.get('database')=='connected' and http('http://127.0.0.1:8080/')[0]==200:return
  except Exception:pass
  time.sleep(3)
 raise Failure('production_health_timeout')
def smoke():
 api,body=http('http://127.0.0.1:8080/api/health');data=json.loads(body);data=data.get('data',data)
 protected=http('http://127.0.0.1:8080/api/users')[0]
 if api!=200 or data.get('database')!='connected' or protected not in (401,403):raise Failure('production_proxy_smoke_failed')
 return {'apiHealth':api,'database':data['database'],'unauthenticatedUsers':protected,'frontend':http('http://127.0.0.1:8080/')[0]}
def db_query(sql):
 return docker('exec','-i','gs-db','sh','-c','exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -v ON_ERROR_STOP=1',data=sql.encode()).stdout.decode().strip()
def preflight():
 if STATE.exists():raise Failure('release_state_exists')
 if any(not os.access(str(p),os.W_OK) for p in [ROOT,ROOT/'.env']):raise Failure('production_configuration_not_writable')
 if any(not os.access(str(p),os.R_OK) for p in [FILES[0][1],FILES[1][1]]):raise Failure('production_compose_not_readable')
 if not NORMAL.is_file() or NORMAL.stat().st_mode&0o777!=0o600:raise Failure('validated_key_missing')
 key=NORMAL.read_text().strip().split('=',1)[1]
 if len(base64.b64decode(key,validate=True))!=32:raise Failure('validated_key_invalid')
 original=ROOT/'.env';values=[]
 for line in original.read_text().splitlines():
  m=re.match(r'^\s*(?:export\s+)?MFA_ENCRYPTION_KEY\s*=\s*(.*)$',line)
  if m:
   value=m.group(1).strip()
   if len(value)>1 and value[0]==value[-1] and value[0] in ('"',"'"):value=value[1:-1]
   values.append(value)
 if key not in values:raise Failure('validated_key_not_existing_entry')
 old={service:inspect('gs-'+service) for service in ('api','frontend')};db=inspect('gs-db')
 if db['State'].get('Health',{}).get('Status')!='healthy':raise Failure('database_not_healthy')
 for service,m in old.items():
  labels=m['Config'].get('Labels') or {}
  if labels.get('com.docker.compose.project')!='grupo-security' or labels.get('com.docker.compose.service')!=service:raise Failure('unexpected_production_target')
  if set(m['NetworkSettings']['Networks'])!={'grupo-security_default'}:raise Failure('unexpected_production_network')
 for source,destination,digest in FILES:
  if hashlib.sha256(source.read_bytes()).hexdigest()!=digest:raise Failure('compose_source_hash_mismatch')
 for image in SOURCES.values():docker('image','inspect',image)
 if len(old['api']['Mounts'])!=2 or not any(m.get('Name')=='grupo-security_uploads' and m['Destination']=='/app/uploads' for m in old['api']['Mounts']) or not any(m.get('Source')==str(ROOT/'data/imports') and m['Destination']=='/app/biblioteca' for m in old['api']['Mounts']):raise Failure('unexpected_persistent_storage')
 if old['frontend']['Mounts']:raise Failure('unexpected_frontend_storage')
 return key,old,db

def main():
 key,old,db=preflight()
 STATE.mkdir(mode=0o700,parents=True);os.chmod(STATE,0o700)
 for path in [ROOT/'.env',FILES[0][1],FILES[1][1]]:private(STATE/(path.name+'.previous'),path.read_bytes())
 private(STATE/'original-containers.json',json.dumps(old).encode())
 migrations=db_query('BEGIN READ ONLY; SELECT count(*) FROM _prisma_migrations; COMMIT;')
 dump=STATE/'database-before.dump';fd=os.open(str(dump),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:docker('exec','gs-db','sh','-c','exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc',out=f,timeout=240)
 if dump.stat().st_size==0:raise Failure('empty_database_backup')
 with dump.open('rb') as f:
  p=subprocess.run(['docker','exec','-i','gs-db','pg_restore','--list'],stdin=f,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=60)
  if p.returncode:raise Failure('database_backup_validation_failed')
 for service,m in old.items():docker('tag',m['Image'],REG+service+':'+OLDTAG)
 for service,image in SOURCES.items():docker('tag',image,REG+service+':'+TAG)
 configured=False;started=False
 try:
  update_env(key,TAG);configured=True
  c=config(TAG);api=c['services']['api'];front=c['services']['frontend'];previous=envdict(old['api'])
  if api['environment'].get('DATABASE_URL')!=previous.get('DATABASE_URL') or api['environment'].get('JWT_SECRET')!=previous.get('JWT_SECRET'):raise Failure('database_or_jwt_configuration_changed')
  if api['environment'].get('MFA_ENCRYPTION_KEY')!=key:raise Failure('key_injection_failed')
  if api['image']!=REG+'api:'+TAG or front['image']!=REG+'frontend:'+TAG:raise Failure('unexpected_compose_images')
  if not all(any(p.get('host_ip')=='127.0.0.1' and str(p.get('published'))==port for p in s.get('ports',[])) for s,port in [(api,'3001'),(front,'8080')]):raise Failure('loopback_ports_missing')
  if c['volumes']['uploads'].get('name')!='grupo-security_uploads':raise Failure('uploads_volume_changed')
  started=True;compose(TAG,'up','-d','--no-deps','--pull','never','api','frontend')
  check_health();checks=smoke();time.sleep(15);check_health(20)
  for service,image in SOURCES.items():
   m=inspect('gs-'+service)
   if m['Image']!=image or m.get('RestartCount',0)!=0:raise Failure('image_or_restarts_changed')
  if inspect('gs-db')['Id']!=db['Id'] or inspect('gs-db')['State']['StartedAt']!=db['State']['StartedAt']:raise Failure('database_container_changed')
  if db_query('BEGIN READ ONLY; SELECT count(*) FROM _prisma_migrations; COMMIT;')!=migrations:raise Failure('migration_count_changed')
  (ROOT/'.deployed-tag').write_text(TAG+'\n')
  public={'root':http('https://dev.gruposecurity.cloud/')[0],'apiHealth':http('https://dev.gruposecurity.cloud/api/health')[0]}
  result={'success':True,'release':TAG,'rollback':False,'smoke':checks,'public':public,'databaseBackupVerified':True,'databaseContainerUnchanged':True,'migrationCountUnchanged':True,'mfaKeyRecoveredWithoutRotation':True}
 except Exception:
  if started:
   try:
    update_env(key,OLDTAG);compose(OLDTAG,'up','-d','--no-deps','--pull','never','api','frontend');check_health();smoke()
    (ROOT/'.deployed-tag').write_text(OLDTAG+'\n')
    result={'success':False,'rollback':True,'error':'deployment_failed_previous_images_restored_with_repaired_config'}
   except Exception:result={'success':False,'rollback':False,'error':'deployment_failed_rollback_needs_attention'}
  else:
   (ROOT/'.env').write_bytes((STATE/'.env.previous').read_bytes())
   result={'success':False,'rollback':False,'error':'configuration_preparation_failed_no_service_update'}
 private(STATE/'result.json',json.dumps(result).encode())
 return result
if __name__=='__main__':
 try:
  if os.sys.argv[1:]==['--preflight']:
   preflight();r={'success':True,'preflight':'ok'}
  elif os.sys.argv[1:]:raise Failure('unknown_arguments')
  else:r=main()
 except Exception as error:r={'success':False,'error':str(error) if isinstance(error,Failure) else 'production_preparation_failed'}
 print(json.dumps(r,sort_keys=True));raise SystemExit(0 if r.get('success') else 1)
