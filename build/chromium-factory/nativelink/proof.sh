#!/bin/bash
# Remote-execution proof for the NativeLink workers: 24 genrules, each prints the hostname of the worker that ran it.
# Run on fr1 (bazelisk, fleet-registry); result = count of actions per worker host. 2026-11-15: 7 on fr2, 17 on fr1.
d=/tmp/nlproof; rm -rf $d; mkdir -p $d; cd $d
echo '' > MODULE.bazel
{ for i in $(seq 1 24); do printf 'genrule(name="g%s", outs=["o%s.txt"], cmd="sleep 4; echo $$(hostname) $$(date +%%s) > $@ # %s")\n' $i $i $i; done; } > BUILD
S=$(fleet-registry endpoint nativelink-scheduler)
export USE_BAZEL_VERSION=latest
timeout 600 bazelisk --output_user_root=/tmp/bzl --connect_timeout_secs=400 build //... --remote_executor=grpc://$S --remote_instance_name=main --jobs=24 --spawn_strategy=remote --genrule_strategy=remote --remote_default_exec_properties=cpu_count=4 --remote_default_exec_properties=OSFamily=Linux --remote_default_exec_properties=ISA=x86-64 --remote_download_outputs=all 2>&1 | tail -6
echo "--- executed on:"; cat bazel-bin/o*.txt | awk '{print $1}' | sort | uniq -c
