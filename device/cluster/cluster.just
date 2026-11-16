# Cluster layer: LB + failover + dedup across fr1/fr2/prd, generated from device/deploy.toml.

# Regenerate device/cluster/generated/* from device/deploy.toml [cluster]
[group('cluster')]
cluster-gen:
    bun "{{root}}/device/cluster/gen.ts"

# Push + validate + reload one member (rollback: just cluster-down <member>)
[group('cluster')]
cluster-deploy member: cluster-gen
    bash "{{root}}/device/cluster/deploy.sh" {{member}}

# Stop the cluster data plane on one member (HAProxy off, nginx shard conf removed)
[group('cluster')]
cluster-down member:
    bash "{{root}}/device/cluster/deploy.sh" {{member}} down

# Issue/renew a member certificate (CA key stays in ~/.local/share/aphrody/cluster-ca)
[group('cluster')]
cluster-pki member:
    bash "{{root}}/device/cluster/pki.sh" {{member}}

# Health, mesh matrix vs WireGuard, kill-test, coalescing, idempotency, dedup ratio
[group('cluster')]
cluster-proof:
    bash "{{root}}/device/cluster/proof.sh"
