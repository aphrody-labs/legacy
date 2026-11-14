#!/usr/bin/env bash
# Provision fr2: JDK 21, official Ghidra release, pyghidra venv. Run: ssh cdn bash -s < provision-fr2.sh
set -u
G=/srv/ghidra-release
URL=https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.2_build/ghidra_12.2_PUBLIC_20261016.zip
command -v java >/dev/null || sudo -n apt-get install -y -q openjdk-21-jdk-headless unzip
sudo -n mkdir -p $G && sudo -n chown ubuntu $G
[ -f $G/g.zip ] || curl -sSL -m 500 -o $G/g.zip $URL
[ -d $G/ghidra_12.2_PUBLIC ] || unzip -q -o $G/g.zip -d $G
[ -d $G/venv ] || uv venv $G/venv
uv pip install -q --python $G/venv/bin/python pyghidra==3.2.0
echo provisioned
