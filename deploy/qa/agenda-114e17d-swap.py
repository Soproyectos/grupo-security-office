#!/usr/bin/env python3
"""QA-only swap. Metadata and uploads remain private on the VPS."""
import hashlib, json, os, shlex, subprocess, sys, tarfile, time
from pathlib import Path

NET='gs-test-demo-net'
STATE=Path('/tmp/gs-agenda-release-114e17d')
TARGETS=[('gs-test-demo-api','gs-test-demo-api:agenda-114e17d','172.20.0.3'),('gs-test-demo-web','gs-test-demo-web:agenda-114e17d','172.20.0.4')]
READ_CHECK=Path('/tmp/qa_agenda_readonly.cjs')
class Failure(Exception): pass

def run(*args, check=True, timeout=40, data=None, out=None, inp=None):
    p=subprocess.run(['docker',*map(str,args)],input=data,stdin=inp,stdout=out or subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if check and p.returncode: raise Failure('docker_'+str(args[0])+'_failed')
    return p

def inspect(name): return json.loads(run('inspect',name).stdout)[0]
def exists(name): return run('inspect',name,check=False).returncode==0

def private(path, data):
    fd=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as f: f.write(data)

def wait_api(name, timeout=90):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        m=inspect(name)
        if m['State'].get('Health',{}).get('Status')=='healthy': return
        if not m['State']['Running'] or m['State'].get('Health',{}).get('Status')=='unhealthy': raise Failure('api_health_failed')
        time.sleep(2)
    raise Failure('api_health_timeout')

def http(name,path,port=80):
    p=run('exec',name,'wget','-S','-O','-','-T','8',f'http://127.0.0.1:{port}{path}',check=False,timeout=12)
    status=None
    for line in p.stderr.decode(errors='replace').splitlines():
        bits=line.strip().split()
        if bits and bits[0].startswith('HTTP/') and len(bits)>1: status=int(bits[1])
    return status,p.stdout

def smoke():
    root,_=http(TARGETS[1][0],'/')
    status,body=http(TARGETS[1][0],'/api/health')
    data=json.loads(body); data=data.get('data',data)
    protected,_=http(TARGETS[1][0],'/api/users')
    if root!=200 or status!=200 or data.get('status')!='ok' or data.get('database')!='connected' or protected not in (401,403): raise Failure('proxy_smoke_failed')
    return {'root':root,'apiHealth':status,'database':data['database'],'unauthenticatedUsers':protected}

def preflight():
    if STATE.exists() or not READ_CHECK.is_file(): raise Failure('release_state_exists_or_check_missing')
    records=[]
    for name,image,ip in TARGETS:
        m=inspect(name); candidate=json.loads(run('image','inspect',image).stdout)[0]
        if m['Name']!='/'+name or not m['State']['Running']: raise Failure('target_identity_or_state_changed')
        if name==TARGETS[0][0] and m['State'].get('Health',{}).get('Status')!='healthy': raise Failure('original_api_not_healthy')
        c=m['Config']; h=m['HostConfig']; nets=m['NetworkSettings']['Networks']
        if set(nets)!={NET} or nets[NET]['IPAddress']!=ip: raise Failure('unexpected_qa_network')
        if m.get('Mounts') or h.get('Binds') or h.get('PortBindings') or h.get('VolumesFrom') or c.get('Volumes'): raise Failure('unexpected_storage_or_ports')
        for field in ('Privileged','ReadonlyRootfs','CapAdd','CapDrop','Devices','DeviceRequests','SecurityOpt','Tmpfs','ExtraHosts','Dns','DnsOptions','DnsSearch','Sysctls','Ulimits','GroupAdd','Init','PidMode','UsernsMode','Memory','MemorySwap','MemoryReservation','NanoCpus','CpuShares','CpuPeriod','CpuQuota','CpusetCpus','CpusetMems','PidsLimit','OomKillDisable','OomScoreAdj'):
            if h.get(field) not in (None,False,0,[],{},''): raise Failure('unsupported_runtime_option_'+field)
        for field,expected in [('Runtime','runc'),('IpcMode','private'),('CgroupnsMode','private'),('ShmSize',67108864),('ConsoleSize',[0,0])]:
            if h.get(field)!=expected: raise Failure('nondefault_runtime_'+field)
        if c.get('Tty') or c.get('OpenStdin') or c.get('StdinOnce'): raise Failure('interactive_container_unsupported')
        if (c.get('Healthcheck') or {}).get('StartInterval',0): raise Failure('custom_health_start_interval_unsupported')
        if h.get('RestartPolicy',{}).get('Name')!='unless-stopped': raise Failure('unexpected_restart_policy')
        if c.get('Entrypoint')!=candidate['Config'].get('Entrypoint') or c.get('Cmd')!=candidate['Config'].get('Cmd'): raise Failure('entrypoint_or_command_changed')
        env=c.get('Env') or []
        if any('\n' in e or '\r' in e for e in env): raise Failure('multiline_environment_not_supported')
        aliases=nets[NET].get('Aliases') or []
        if name==TARGETS[0][0] and 'api' not in aliases: raise Failure('api_alias_missing')
        backup=name+'-pre-agenda-114e17d'; failed=name+'-failed-agenda-114e17d'
        if exists(backup) or exists(failed): raise Failure('backup_name_exists')
        records.append({'name':name,'image':candidate['Id'],'ip':ip,'old':m,'aliases':aliases,'backup':backup,'failed':failed,'touched':False})
    return records

def create(r):
    c=r['old']['Config']; h=r['old']['HostConfig']
    args=['create','--name',r['name'],'--restart','unless-stopped','--network',NET,'--ip',r['ip'],'--env-file',str(STATE/(r['name']+'.env'))]
    for a in r['aliases']: args+=['--network-alias',a]
    for field,flag in [('User','--user'),('WorkingDir','--workdir'),('Hostname','--hostname'),('StopSignal','--stop-signal')]:
        if c.get(field): args+=[flag,c[field]]
    for k,v in (c.get('Labels') or {}).items(): args+=['--label',k+'='+v]
    log=h.get('LogConfig') or {}
    if log.get('Type'): args+=['--log-driver',log['Type']]
    for k,v in (log.get('Config') or {}).items(): args+=['--log-opt',k+'='+v]
    if c.get('StopTimeout') is not None: args+=['--stop-timeout',str(c['StopTimeout'])]
    hc=c.get('Healthcheck') or {}
    test=hc.get('Test') or []
    if r['name']==TARGETS[1][0]: args+=['--health-cmd','wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1']
    elif test:
        if test[0]=='CMD-SHELL': command=test[1]
        elif test[0]=='CMD': command=shlex.join(test[1:])
        else: raise Failure('unsupported_healthcheck')
        args+=['--health-cmd',command]
    for key,flag in [('Interval','--health-interval'),('Timeout','--health-timeout'),('StartPeriod','--health-start-period')]:
        if hc.get(key): args+=[flag,str(hc[key])+'ns']
    if hc.get('Retries'): args+=['--health-retries',str(hc['Retries'])]
    args.append(r['image'])
    run(*args)

def swap(r):
    r['touched']=True
    run('stop','--time','20',r['old']['Id'],timeout=35)
    run('rename',r['old']['Id'],r['backup'])
    run('network','disconnect',NET,r['old']['Id'])
    create(r)
    if r['name']==TARGETS[0][0]:
        archive=STATE/'uploads.tar'
        fd=os.open(str(archive),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as f: run('cp',r['backup']+':/app/uploads','-',timeout=120,out=f)
        if not archive.stat().st_size: raise Failure('uploads_backup_empty')
        original_manifest=manifest(archive)
        with archive.open('rb') as f: run('cp','-a','-',r['name']+':/app',inp=f,timeout=120)
        verified=STATE/'uploads-verified.tar'
        fd=os.open(str(verified),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as f: run('cp',r['name']+':/app/uploads','-',out=f,timeout=120)
        if manifest(verified)!=original_manifest: raise Failure('uploads_verification_failed')
    run('start',r['name'])
    if r['name']==TARGETS[0][0]: wait_api(r['name'])
    else:
        end=time.monotonic()+45
        while time.monotonic()<end:
            if http(r['name'],'/')[0]==200: return
            time.sleep(2)
        raise Failure('web_start_timeout')

def manifest(archive):
    entries=[]
    with tarfile.open(archive,'r:') as tar:
        for member in tar:
            path=Path(member.name)
            if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0]!='uploads': raise Failure('unexpected_upload_archive_path')
            digest=None
            if member.isfile():
                file=tar.extractfile(member); h=hashlib.sha256()
                while True:
                    chunk=file.read(1024*1024)
                    if not chunk: break
                    h.update(chunk)
                digest=h.hexdigest()
            entries.append((member.name.rstrip('/'),str(member.type),member.linkname,member.mode,member.uid,member.gid,member.size,digest))
    return sorted(entries)

def ensure_stopped(container_id):
    try: run('stop','--time','15',container_id,check=False,timeout=25)
    except subprocess.TimeoutExpired: pass
    if inspect(container_id)['State']['Running']:
        try: run('kill',container_id,check=False,timeout=15)
        except subprocess.TimeoutExpired: pass
    if inspect(container_id)['State']['Running']: raise Failure('candidate_cannot_be_stopped')

def rollback(records):
    errors=[]
    for r in records:
        if not r['touched']: continue
        try:
            old=inspect(r['old']['Id'])
            if exists(r['name']):
                current=inspect(r['name'])
                if current['Id']!=r['old']['Id']:
                    ensure_stopped(current['Id'])
                    if NET in inspect(current['Id'])['NetworkSettings']['Networks']:
                        run('network','disconnect','--force',NET,current['Id'])
                    run('rename',current['Id'],r['failed'])
            if old['Name']!='/'+r['name']: run('rename',old['Id'],r['name'])
            old=inspect(old['Id'])
            if NET not in old['NetworkSettings']['Networks']:
                args=['network','connect','--ip',r['ip']]
                for alias in r['aliases']: args+=['--alias',alias]
                run(*args,NET,old['Id'])
            if not inspect(old['Id'])['State']['Running']: run('start',old['Id'])
            if r['name']==TARGETS[0][0]: wait_api(r['name'])
        except Exception:
            errors.append(r['name'])
    if errors: raise Failure('rollback_incomplete')
    smoke()

def main():
    records=preflight()
    STATE.mkdir(mode=0o700)
    for r in records:
        private(STATE/(r['name']+'.inspect.json'),json.dumps(r['old']).encode())
        private(STATE/(r['name']+'.env'),('\n'.join(r['old']['Config']['Env'])+'\n').encode())
    try:
        swap(records[0])
        checked=run('exec','-i',TARGETS[0][0],'node',data=READ_CHECK.read_bytes(),timeout=90)
        checks=json.loads(checked.stdout)
        if not checks.get('ok') or checks.get('checkedUsers',0)<1 or checks.get('ownAgendaAllowed',0)<1: raise Failure('agenda_readonly_checks_failed')
        swap(records[1])
        first=smoke()
        time.sleep(20)
        wait_api(TARGETS[0][0],timeout=15)
        final=smoke()
        for r in records:
            m=inspect(r['name'])
            if m['Image']!=r['image'] or m.get('RestartCount',0)!=0: raise Failure('image_or_restart_verification_failed')
        result={'success':True,'rollback':False,'release':'114e17d','images':{r['name']:r['image'] for r in records},'smoke':final,'agendaReadOnly':checks}
    except Exception:
        try:
            rollback(records)
            result={'success':False,'rollback':True,'error':'deployment_failed_originals_restored'}
        except Exception:
            result={'success':False,'rollback':False,'error':'deployment_failed_rollback_needs_attention'}
    private(STATE/'result.json',json.dumps(result).encode())
    return result

if __name__=='__main__':
    try:
        if sys.argv[1:]==['--preflight']:
            records=preflight(); result={'success':True,'preflight':'ok','targets':[r['name'] for r in records]}
        elif sys.argv[1:]: raise Failure('unknown_arguments')
        else: result=main()
    except Exception as error: result={'success':False,'rollback':False,'error':str(error) if isinstance(error,Failure) else 'preflight_or_state_failed'}
    print(json.dumps(result,sort_keys=True));sys.exit(0 if result.get('success') else 1)
