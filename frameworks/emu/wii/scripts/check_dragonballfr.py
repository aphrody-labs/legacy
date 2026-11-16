import subprocess

cmd = ['ssh', 'prd', 'grep -rn "dragonballfr" /etc /srv 2>/dev/null || true']
p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
print("STDOUT:", p.stdout)
print("STDERR:", p.stderr)
