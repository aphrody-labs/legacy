#!/bin/sh
ls -la /usr/local/bin/sccache /usr/local/bin/cargo-nextest /tmp/sccache /tmp/cargo-nextest 2>&1 | cut -c1-120
sccache --version
