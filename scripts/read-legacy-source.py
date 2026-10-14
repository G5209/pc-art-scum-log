"""Local literal configuration importer. Parent captures stdout; never log it."""
import ast, json, sys
allowed = {'SFTP_HOST','SFTP_PORT','SFTP_USER','SFTP_PASSWORD','SFTP_KEY_PATH','SFTP_REMOTE_LOG_DIR','KNOWN_HOSTS'}
try:
    with open(sys.argv[1], encoding='utf-8-sig') as file:
        tree = ast.parse(file.read())
    result = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in allowed:
                    result[target.id] = ast.literal_eval(node.value)
    print(json.dumps(result))
except Exception:
    sys.exit(1)
