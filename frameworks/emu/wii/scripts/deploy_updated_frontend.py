import os
import subprocess

files_to_sync = [
    (r"C:\src\wii\wii-os\frontend\views\settings-main.html", "/srv/wii-os/frontend/views/settings-main.html"),
    (r"C:\src\wii\wii-os\frontend\assets\css\settings.css", "/srv/wii-os/frontend/assets/css/settings.css"),
    (r"C:\src\wii\wii-os\frontend\games\budokai-tenkaichi-3\index.html", "/srv/wii-os/frontend/games/budokai-tenkaichi-3/index.html"),
    (r"C:\src\wii\wii-os\frontend\assets\js\views.js", "/srv/wii-os/frontend/assets/js/views.js"),
    (r"C:\src\wii\wii-os\frontend\assets\js\main.js", "/srv/wii-os/frontend/assets/js/main.js"),
]

# ssh alias of the production host (~/.ssh/config): key and address stay out of the repository.
host = "prd"

for local_path, remote_path in files_to_sync:
    print(f"Uploading {local_path} -> {remote_path}...")
    with open(local_path, "rb") as f:
        data = f.read()
    
    cmd = [
        "ssh", host,
        f"mkdir -p $(dirname {remote_path}) && cat > {remote_path}"
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = p.communicate(input=data)
    if p.returncode != 0:
        print(f"Error syncing {local_path}:", stderr.decode(errors="replace"))
    else:
        print(f"Successfully synced {local_path} ({len(data)} bytes)")

print("\nRestarting wii-os-shenron.service...")
cmd_restart = [
    "ssh", host,
    "systemctl restart wii-os-shenron.service && systemctl is-active wii-os-shenron.service"
]
p = subprocess.run(cmd_restart, capture_output=True, text=True, encoding="utf-8", errors="replace")
print("Status:", p.stdout.strip())
