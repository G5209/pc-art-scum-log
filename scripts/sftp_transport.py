"""Local private-pipe worker. Remote operations are list/stat/open/read only."""
import base64, json, sys, posixpath, re, os
import paramiko
config = json.loads(sys.stdin.readline())["config"]
client = None
sftp = None

def connect():
    global client, sftp
    if sftp is None:
        client = paramiko.SSHClient()
        explicit_hosts = (config.get("known_hosts_path") or "").strip()
        recorded_hosts = explicit_hosts or os.path.join("data", "runtime", "known_hosts")
        if explicit_hosts:
            client.load_host_keys(explicit_hosts)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
        else:
            if os.path.isfile(recorded_hosts):
                client.load_host_keys(recorded_hosts)

            class RecordHostKeyPolicy(paramiko.MissingHostKeyPolicy):
                def missing_host_key(self, host_client, hostname, key):
                    host_client.get_host_keys().add(hostname, key.get_name(), key)
                    os.makedirs(os.path.dirname(recorded_hosts), exist_ok=True)
                    host_client.save_host_keys(recorded_hosts)

            client.set_missing_host_key_policy(RecordHostKeyPolicy())
        settings = dict(hostname=config["host"], port=config["port"], username=config["username"], timeout=8, auth_timeout=8, banner_timeout=8, allow_agent=False, look_for_keys=False)
        if config["auth_type"] == "key":
            settings["key_filename"] = config["key_path"]
            if config.get("password"): settings["passphrase"] = config["password"]
        else: settings["password"] = config["password"]
        client.connect(**settings)
        sftp = client.open_sftp()
        sftp.get_channel().settimeout(8)
    return sftp

def execute(req):
    global client, sftp
    try:
        sf = connect()
        op = req["op"]
        if op == "connect": result = True
        elif op == "list":
            result = [{"name":f.filename,"size":f.st_size,"mtime":f.st_mtime} for f in sf.listdir_attr(config["remote_log_dir"]) if re.fullmatch(r"[a-z_]+_\d{14}\.log", f.filename)]
        else:
            name = req["name"]
            if not re.fullmatch(r"[a-z_]+_\d{14}\.log",name): raise ValueError()
            remote = posixpath.join(config["remote_log_dir"],name)
            if op == "stat":
                f=sf.stat(remote)
                result={"size":f.st_size,"mtime":f.st_mtime}
            elif op == "read":
                offset,limit=int(req["offset"]),int(req["limit"])
                if offset<0 or not 0<=limit<=5_000_000: raise ValueError()
                with sf.open(remote,"rb") as f:
                    f.seek(offset)
                    data=f.read(limit)
                result={"data":base64.b64encode(data).decode("ascii")}
            else: raise ValueError()
        output={"id":req["id"],"result":result}
    except Exception:
        output={"id":req.get("id"),"error":"connection_failed"}
        if client: client.close()
        client=sftp=None
    print(json.dumps(output),flush=True)

for line in sys.stdin:
    try: execute(json.loads(line))
    except Exception: print(json.dumps({"error":"invalid_request"}),flush=True)
if client: client.close()
