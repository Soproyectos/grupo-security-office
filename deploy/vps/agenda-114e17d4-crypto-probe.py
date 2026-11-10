#!/usr/bin/env python3
"""Read-only production crypto compatibility probe. Run on the VPS as devDocker."""

import json
import os
import re
import subprocess
import sys
from pathlib import Path


COMPOSE = ["/opt/grupo-security/docker-compose.prod.yml",
           "/opt/grupo-security/deploy/vps/docker-compose.override.yml"]
IMAGE_TAG = "89046564"
DB_CONTAINER = "gs-db"
PROBE_IMAGE = "gs-test-demo-api:agenda-114e17d"
STATE = Path("/tmp/gs-production-crypto-probe-114e17d-v3")
NODE_SCRIPT = r'''const crypto=require("crypto"),fs=require("fs");let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>{let out={mfaCount:0,mfaValidCount:0,notionCount:0,notionValidCount:0,candidateCount:0,selectedCandidate:null,normalizationPreservesMfa:false,ok:false};try{const x=JSON.parse(input);out.candidateCount=x.rawKeys.length;for(let i=0;i<x.rawKeys.length;i++){const raw=x.rawKeys[i];const d=Buffer.from(raw,"base64");const key=d.length===32?d:crypto.createHash("sha256").update(raw).digest();let mv=0,nv=0;function open(iv,tag,data){const dec=crypto.createDecipheriv("aes-256-gcm",key,iv);dec.setAuthTag(tag);Buffer.concat([dec.update(data),dec.final()])}for(const s of x.mfa){try{const p=s.split(":");if(p.length!==3)throw Error();open(Buffer.from(p[0],"base64"),Buffer.from(p[1],"base64"),Buffer.from(p[2],"base64"));mv++}catch{}}for(const r of x.notion){try{for(const s of [r.accessToken,r.refreshToken]){const b=Buffer.from(s,"base64");if(b.length<29)throw Error();open(b.subarray(0,12),b.subarray(12,28),b.subarray(28))}nv++}catch{}}out.mfaCount=x.mfa.length;out.notionCount=x.notion.length;out.mfaValidCount=mv;out.notionValidCount=nv;if(mv===x.mfa.length&&nv===x.notion.length){const normalized=key.toString("base64");out.normalizationPreservesMfa=Buffer.from(normalized,"base64").equals(key);out.ok=out.normalizationPreservesMfa;out.selectedCandidate=i;fs.writeFileSync("/release/normalized.env","MFA_ENCRYPTION_KEY="+normalized+"\n",{mode:0o600,flag:"wx"});break}}}catch{out.ok=false}process.stdout.write(JSON.stringify(out))});'''


class SafeError(Exception):
    pass


def run(args, *, input_bytes=None, timeout=60, check=True, cwd=None, env=None):
    try:
        p = subprocess.run(args, input=input_bytes, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, timeout=timeout, check=False,
                           cwd=cwd, env=env)
    except Exception as e:
        raise SafeError(f"command could not run: {args[0]}") from e
    if check and p.returncode:
        raise SafeError(f"command failed ({p.returncode}): {args[0]}")
    return p


def compose_config():
    args = ["docker", "compose"]
    for f in COMPOSE:
        if not Path(f).is_file():
            raise SafeError("required compose file missing")
        args += ["-f", f]
    args += ["--env-file", "/opt/grupo-security/.env", "config", "--format", "json"]
    env = os.environ.copy()
    env["IMAGE_TAG"] = IMAGE_TAG
    p = run(args, timeout=60, cwd="/opt/grupo-security", env=env)
    try:
        return json.loads(p.stdout)
    except Exception as e:
        raise SafeError("compose config output was not valid JSON") from e


def environment(service):
    env = service.get("environment") or {}
    if isinstance(env, list):
        pairs = [s.split("=", 1) for s in env if "=" in s]
        return dict(pairs)
    return env


def read_key(config):
    services = config.get("services") or {}
    api = services.get("gs-api") or services.get("api")
    if not isinstance(api, dict):
        raise SafeError("API service not found in compose config")
    key = environment(api).get("MFA_ENCRYPTION_KEY")
    if not isinstance(key, str) or not key:
        raise SafeError("MFA_ENCRYPTION_KEY missing from effective API config")
    return key


def db_json():
    psql = ["docker", "exec", "-i", DB_CONTAINER, "sh", "-c",
            'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -v ON_ERROR_STOP=1']
    tables = run(psql, input_bytes=b"BEGIN READ ONLY; SELECT json_build_object('mfa',to_regclass('public.user_mfa') IS NOT NULL,'notion',to_regclass('public.notion_tokens') IS NOT NULL); COMMIT;").stdout
    present = json.loads(tables)
    mfa = "COALESCE((SELECT json_agg(secret) FROM public.user_mfa),'[]'::json)" if present['mfa'] else "'[]'::json"
    notion = "COALESCE((SELECT json_agg(json_build_object('accessToken',\"accessToken\",'refreshToken',\"refreshToken\")) FROM public.notion_tokens),'[]'::json)" if present['notion'] else "'[]'::json"
    sql = "BEGIN READ ONLY; SELECT json_build_object('mfa',"+mfa+",'notion',"+notion+"); COMMIT;"
    p = run(psql, input_bytes=sql.encode(), timeout=90)
    try:
        data = json.loads(p.stdout)
        if not isinstance(data.get("mfa"), list) or not isinstance(data.get("notion"), list):
            raise ValueError()
        return data
    except Exception as e:
        raise SafeError("database returned unexpected probe data") from e


def make_private_dir():
    try:
        STATE.mkdir(mode=0o700)
    except FileExistsError as e:
        raise SafeError("probe state directory already exists") from e
    os.chmod(STATE, 0o700)


def probe(raw_key, rows):
    uid, gid = os.getuid(), os.getgid()
    make_private_dir()
    release = STATE / "release"
    release.mkdir(mode=0o700)
    os.chmod(release, 0o700)
    payload = json.dumps({"rawKeys": raw_key, **rows}, separators=(",", ":")).encode()
    command = ["docker", "run", "--rm", "-i", "--network", "none", "--user", f"{uid}:{gid}",
               "--mount", f"type=bind,src={release},dst=/release", PROBE_IMAGE,
               "node", "-e", NODE_SCRIPT]
    p = run(command, input_bytes=payload, timeout=120, check=False)
    if p.returncode:
        raise SafeError("ephemeral Node crypto probe failed")
    try:
        result = json.loads(p.stdout)
        allowed = {"ok", "mfaCount", "mfaValidCount", "notionCount", "notionValidCount",
                   "normalizationPreservesMfa", "candidateCount", "selectedCandidate"}
        if set(result) - allowed or not isinstance(result.get("ok"), bool):
            raise ValueError()
    except Exception as e:
        raise SafeError("crypto probe returned unexpected output") from e
    env_path = release / "normalized.env"
    result["normalizedEnvCreated"] = env_path.is_file()
    if result["normalizedEnvCreated"]:
        if env_path.stat().st_mode & 0o777 != 0o600:
            raise SafeError("normalized env file permissions are not 0600")
    result["normalizedEnvPath"] = str(env_path) if result["normalizedEnvCreated"] else None
    return result


def main():
    config = compose_config()
    key = read_key(config)
    candidates = [key]
    for line in Path('/opt/grupo-security/.env').read_text().splitlines():
        match = re.match(r'^\s*(?:export\s+)?MFA_ENCRYPTION_KEY\s*=\s*(.*)$', line)
        if not match: continue
        value = match.group(1).strip()
        if len(value)>1 and value[0]==value[-1] and value[0] in ('"',"'"): value=value[1:-1]
        if value and value not in candidates: candidates.append(value)
    rows = db_json()
    return probe(candidates, rows)


if __name__ == "__main__":
    try:
        result = main()
        print(json.dumps(result, sort_keys=True))
        sys.exit(0 if result.get("normalizedEnvCreated") else 1)
    except Exception as exc:
        # Never relay subprocess stderr or secret-bearing exception details.
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        sys.exit(1)
