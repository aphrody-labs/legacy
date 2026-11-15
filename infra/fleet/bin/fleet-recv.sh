#!/bin/bash
# Forced command of the transfer key on the XFS owner (fr1): stores stdin as /srv/xbuild/backup/fr2/<name>, prints its sha256.
# <name> comes from the ssh command line (SSH_ORIGINAL_COMMAND), restricted to [a-z0-9._-]; the key can do nothing else.
n=${SSH_ORIGINAL_COMMAND:-}
[[ $n =~ ^[a-z0-9][a-z0-9._-]{0,80}$ ]] || { echo "bad name" >&2; exit 64; }
d=/srv/xbuild/backup/fr2; umask 077; mkdir -p "$d"
tee "$d/$n" | sha256sum | cut -d' ' -f1
