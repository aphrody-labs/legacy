# Single source of the fleet peers trusted by fr2 nginx (geo $fleet_peer in conf.d/aop.conf): loopback, mesh, and the
# public v4/v6 of fr1, prd and fr2 itself (fleet-health from fr2, local checks). Same hosts as deploy.toml [nodes.*] and
# fr2-edge-fw.sh fleet4/fleet6; update the three together.
127.0.0.0/8 1;
::1 1;
@@network.mesh_cidr@@ 1;
@@hosts.fr1.public_ip@@ 1;
@@hosts.prd.public_ip@@ 1;
@@hosts.fr2.public_ip@@ 1;
@@hosts.fr1.public_ipv6@@ 1;
@@hosts.prd.public_ipv6@@ 1;
@@hosts.fr2.public_ipv6@@ 1;
