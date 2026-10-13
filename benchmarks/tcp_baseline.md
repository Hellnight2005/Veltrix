# LocalDrop TCP Baseline Benchmarks (Phase E1 / P1)

## Environment Specification

* **Operating System:** Windows 11 (x86_64)
* **Rust Toolchain:** `rustc 1.99.0` (stable-x86_64-pc-windows-gnu)
* **Linker / Runtime:** LLVM-MinGW Clang 23.1.1 (UCRT)
* **Transport:** TCP (`tokio::net::TcpStream` with `TCP_NODELAY = true`)
* **Framing:** 4-byte BE length-prefixed + `postcard` binary serialization (`serde_bytes`)
* **Chunk Size:** 1 MiB (`1,048,576` bytes)
* **Verification:** SHA-256 computed streaming on-the-fly both client and server side

---

## Benchmark Measurements

| Test Payload | Size (Bytes) | Chunks | Wall Clock (s) | Measured Throughput (MB/s) | Final SHA-256 Match |
|---|---|---|---|---|---|
| **Small Payload** | 1,048,576 (1 MB) | 1 | 0.04s | > 25.0 MB/s | ✅ Verified |
| **Medium Payload** | 104,857,600 (100 MB) | 100 | 1.36s | **73.15 MB/s** | ✅ Verified (`998fa39f...`) |
| **Large Payload** | 1,073,741,824 (1 GB) | 1,024 | 14.23s | **71.93 MB/s** | ✅ Verified (`e18e3f35...`) |

---

## Memory Footprint Observations

* **Memory Scaling:** Flat $O(\text{chunk\_size})$ across all transfers.
* **RSS Behavior:** Peak memory for both sender and receiver remained bounded under 25 MB during the 1 GB transfer, confirming that zero full-file buffering occurs.
