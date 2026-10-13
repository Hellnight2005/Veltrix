---
name: Benchmark Submission
about: Share your local network throughput and hardware benchmarks
title: "[BENCH] "
labels: ["benchmark"]
assignees: ""
---

## Hardware & Network Environment
- **Sender Hardware**: [e.g. AMD Ryzen 9 7900X, Apple M3 Pro, Pixel 9 Pro]
- **Receiver Hardware**: [e.g. Intel i7-13700K, Raspberry Pi 5, LG Smart TV]
- **Network Interface**: [e.g. Wi-Fi 6 5GHz (160MHz), 1GbE LAN, 2.5GbE LAN]
- **Operating System**: [e.g. Linux 6.8, Windows 11 23H2, Android 15]

## Benchmark Results

| Payload Size | Chunk Size | Wall Clock (s) | Throughput (MB/s) | Peak Memory RSS (MB) | SHA-256 Verified |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **100 MB** | 1 MB | | | | [ ] Yes |
| **1 GB** | 1 MB | | | | [ ] Yes |
| **10 GB+** | 1 MB | | | | [ ] Yes |

## Commands Used
```bash
# Receiver
cargo run --release -p localdrop_cli -- receive --port 8080 --out ./inbox

# Sender
cargo run --release -p localdrop_cli -- send <IP>:8080 ./test_payload.bin
```

## Observations & Notes
<!-- Any CPU bottleneck, packet drops, or thermal throttling observed? -->
