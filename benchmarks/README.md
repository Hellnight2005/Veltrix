# LocalDrop Performance Benchmarks

This directory contains benchmark suites, harness scripts, and measurement artifacts for validating LocalDrop's performance claims.

## Core Tenet: Measure First, Optimize Second

Per the project tenets:
> No performance claim without a benchmark. `mmap`, zero-copy, and QUIC/UDP are hypotheses that must be justified by reproducible numbers.

## Target Test Payloads

| Payload Size | Purpose |
|---|---|
| `100 MB` | Warmup, latency baseline, rapid iteration |
| `500 MB` | Small file transfer throughput |
| `1 GB` | Standard medium file baseline |
| `5 GB` | High-load memory & disk write soak test |
| `10 GB` | Stress test & memory flatline verification |

## Target Network Profiles

* Wi-Fi 5 (802.11ac)
* Wi-Fi 6 (802.11ax)
* Gigabit Ethernet (1000BASE-T)
* Loopback (`127.0.0.1`)

## Measured Metrics

1. **Throughput (MB/s):** Average and peak transfer rate.
2. **Total Duration (s):** Wall-clock time from connection start to full-file integrity validation.
3. **Peak Memory (RSS):** Must remain flat and bounded regardless of payload size.
4. **CPU Utilization (%):** Average core utilization during transfer.
5. **Resume Time (ms):** Reconnection latency and time to recover missing chunks.
