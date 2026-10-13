# LocalDrop — Project Plan (Engine First)

> **LocalDrop** is a privacy-first, cross-platform peer-to-peer file transfer application for fast, reliable transfers over a local network. The **Rust engine is built and proven first** (as a CLI, with full tests). Flutter, Android and other platforms come only after the engine is stable.

---

## 1. Core Principles

1. **Engine first.** The Rust core must work, fully tested, with no UI at all.
2. **Correctness → Reliability → Security → Measurement → Optimization → Platforms.**
3. **Measure first, optimize second.** No performance claim without a benchmark.
4. **Discovery is not trust.** A discovered device must still be paired and authenticated.
5. **No cloud dependency.** Device A talks directly to Device B.
6. **Do not invent crypto.** Use `rustls` (TLS 1.3) or `snow` (Noise).
7. **Honest about networks.** Wi-Fi client isolation cannot be bypassed; detect it and explain it.
8. **Every phase has tests and an exit gate.** A phase is not done until its gate passes.

---

## 2. Tech Stack

| Area | Choice |
|---|---|
| Engine | Rust, Tokio |
| Serialization | `serde` + `postcard` (or `bincode`) with length-prefixed framing |
| Hashing | `sha2` (SHA-256), optional `blake3` later for speed |
| Discovery | `mdns-sd` + UDP broadcast fallback |
| Transport | TCP (baseline) → QUIC (`quinn`) → custom UDP (research only) |
| Security | `rustls` with pinned self-signed certs, or `snow` (Noise) |
| Logging | `tracing` |
| CLI (engine harness) | `clap`, `indicatif` |
| Errors | `thiserror`, `anyhow` |
| Testing | `cargo test`, `proptest`, `cargo-fuzz`, `criterion`, `tempfile`, `assert_cmd` |
| UI (later) | Flutter, `flutter_rust_bridge`, Riverpod |
| CI | GitHub Actions |

---

## 3. Repository Structure

```text
localdrop/
├── crates/
│   ├── localdrop_core/          # the engine (library)
│   │   ├── src/
│   │   │   ├── discovery/       # mdns.rs, udp.rs
│   │   │   ├── protocol/        # handshake.rs, messages.rs, version.rs, framing.rs
│   │   │   ├── transport/       # tcp.rs, quic.rs, udp.rs
│   │   │   ├── transfer/        # sender.rs, receiver.rs, chunker.rs, resume.rs, state.rs
│   │   │   ├── storage/         # file.rs (FileSource: buffered / mmap / zero-copy)
│   │   │   ├── security/        # identity.rs, pairing.rs
│   │   │   ├── error.rs
│   │   │   └── lib.rs
│   │   ├── tests/               # integration tests
│   │   ├── fuzz/                # cargo-fuzz targets
│   │   └── Cargo.toml
│   └── localdrop_cli/           # CLI harness for the engine
├── apps/
│   └── localdrop_flutter/       # added in the UI phase
├── protocol/                    # written protocol specs
│   ├── README.md  handshake.md  transfer.md  discovery.md  errors.md
├── benchmarks/
├── docs/                        # architecture.md, networking.md, security.md, performance.md
├── scripts/                     # test helpers (large-file generator, network-impairment scripts)
├── .github/workflows/
├── README.md  PROJECT_PLAN.md  CONTRIBUTING.md  SECURITY.md  CHANGELOG.md  LICENSE
```

---

## 4. Roadmap Overview

| Stage | Phases | Outcome |
|---|---|---|
| **A. Engine** | E0 – E7 | A tested, secure, resumable transfer engine usable from the CLI |
| **B. Performance** | P1 – P2 | Measured benchmarks; QUIC / UDP decisions made from data |
| **C. Desktop UI** | U1 – U2 | Flutter app on Windows using the engine |
| **D. Mobile** | M1 | Android support |
| **E. Expansion & Release** | R1 – R2 | Linux, macOS, iOS, signed releases |

| Version | Milestone |
|---|---|
| `v0.1` | E1 — TCP transfer works from the CLI |
| `v0.2` | E2 — chunking, resume, cancel, retry |
| `v0.3` | E3 — discovery |
| `v0.4` | E4 — security and pairing |
| `v0.5` | E5–E7 — hardened engine, stress and failure tested |
| `v0.6` | P1–P2 — benchmarks, transport decisions |
| `v0.7` | U1–U2 — Flutter desktop |
| `v0.8` | M1 — Android |
| `v0.9` | R1 — other platforms |
| `v1.0` | R2 — stable release |

---

# STAGE A — ENGINE

## Phase E0 — Specification and Setup

**Goal:** Define the system before writing it.

**Tasks**
- [x] Create the repo and Cargo workspace (`localdrop_core`, `localdrop_cli`)
- [x] Write `protocol/` docs: handshake, message types and fields, framing, error codes, transfer states
- [x] Define protocol versioning and capability negotiation
- [x] Define the transfer state machine on paper
- [x] Set up CI: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` on Windows and Linux
- [x] Define the test-data tooling (script to generate files of 1 MB, 100 MB, 1 GB, 5 GB)

**What you need:** a decision on framing (u32 length prefix + `postcard`), a maximum message size, and the error-code list.

**Tests**
- CI runs green on an empty skeleton.
- Spec review: each message has fields, valid states, and error cases listed.

**Exit gate:** someone else could implement the protocol from the docs alone.

---

## Phase E1 — Rust TCP Prototype (CLI) → `v0.1`

**Goal:** Send one file from machine A to machine B reliably.

**Tasks**
- [ ] Message framing: length-prefixed read/write with size limits
- [ ] TCP server (`receive`) and client (`send`)
- [ ] Handshake: `HELLO`, `CAPABILITIES`, `ACCEPT`
- [ ] `FILE_METADATA` (transfer id, name, size, SHA-256, chunk size) and `READY`
- [ ] Streaming file transfer with a fixed buffer. Never load the whole file into memory
- [ ] SHA-256 computed while streaming, verified at the end
- [ ] `COMPLETE` / `FAILED_INTEGRITY` reply
- [ ] Progress callback (bytes sent / total, speed)
- [ ] CLI: `localdrop receive --port 8080 --out ./inbox` and `localdrop send <ip:port> <file>`
- [ ] Basic error handling and `tracing` logs

**Tests**
- *Unit:* framing round-trip; message serialization round-trip; reject oversized frames; reject unknown message types; SHA-256 against known vectors.
- *Integration (loopback, in-process):* send 0-byte, 1-byte, 1 MB, and exact-chunk-boundary files; hashes match.
- *Integration:* corrupt a byte in transit (test proxy) → receiver reports `FAILED_INTEGRITY` and deletes the partial file.
- *Integration:* sender disconnects mid-file → receiver cleans up, no crash.
- *Integration:* protocol version mismatch → clean refusal.
- *Manual / scripted:* 5 GB file between two real machines; memory use stays flat (record peak RSS).

**Exit gate:** a 5 GB file transfers with identical hashes, with memory usage independent of file size.

---

## Phase E2 — Transfer Engine → `v0.2`

**Goal:** Make transfers robust: chunked, resumable, cancellable, concurrent.

**Tasks**
- [ ] `chunker.rs`: logical chunks with a configurable size
- [ ] Explicit transfer state machine (`QUEUED → CONNECTING → AUTHENTICATING → PREPARING → TRANSFERRING → VERIFYING → COMPLETED`, plus `INTERRUPTED`, `RECONNECTING`, `RESUMING`, `RETRYING`, `CANCELLED`, `FAILED`) as a Rust enum with validated transitions
- [ ] Resume manifest on disk (transfer id, file id, chunk bitmap, partial-file path)
- [ ] Receiver reports received chunks; sender sends only missing chunks
- [ ] Cancellation from either side, cleaning up partial files
- [ ] Retry with exponential backoff
- [ ] Multiple concurrent transfers with a transfer manager
- [ ] Per-chunk hashes (or per-range) to catch corruption early, plus the final whole-file SHA-256
- [ ] Multi-file and folder transfer (with path sanitization hooks, finished in E4)

**Tests**
- *Unit:* every legal state transition passes and every illegal one is rejected; resume-bitmap math; chunk-boundary calculations.
- *Property tests (`proptest`):* for random file sizes and chunk sizes, chunk + reassemble equals the original; any random subset of missing chunks resumes correctly.
- *Integration:* kill the sender at random points → resume completes, hash matches.
- *Integration:* kill the receiver mid-transfer, restart it → resume completes.
- *Integration:* cancel mid-transfer from each side → both sides reach `CANCELLED`, no leftover files.
- *Integration:* 5–10 simultaneous transfers → all complete, no cross-contamination.
- *Integration:* resume manifest is corrupted or truncated → engine restarts the transfer safely rather than crashing.

**Exit gate:** random kill/restart ("chaos") test run of 100+ iterations passes with zero corrupted files.

---

## Phase E3 — Discovery and Identity → `v0.3`

**Goal:** Devices find each other automatically, with manual IP as the fallback.

**Tasks**
- [ ] Persistent device identity (UUID) stored on disk; never use a MAC address
- [ ] mDNS advertise and browse for `_localdrop._tcp` with metadata (device id, name, platform, port, protocol version)
- [ ] UDP broadcast discovery fallback (`DISCOVER_LOCALDROP` → response)
- [ ] Device registry: add, update, expire (TTL), and event stream (`DeviceFound`, `DeviceLost`)
- [ ] Network-interface selection and change detection
- [ ] Manual IP connection (`ip:port`)
- [ ] Diagnostics: detect "no peers reachable" and report likely causes (client isolation, firewall, VPN, multicast blocked)
- [ ] CLI: `localdrop devices` and `localdrop send <device-name> <file>`

**Tests**
- *Unit:* discovery message parsing; registry expiry logic with a fake clock; duplicate-device merging.
- *Integration:* two engine instances on one machine (different ports) discover each other.
- *Manual matrix:* two real machines on Wi-Fi, on Ethernet, with a VPN on, with the Windows firewall on; record what works.
- *Negative:* malformed or oversized discovery packets are ignored without crashing.
- *Negative:* a device that disappears is removed within the TTL.

**Exit gate:** two machines on the same reachable network discover each other automatically in a measured average time, and a failure gives a clear diagnostic message.

---

## Phase E4 — Security and Pairing → `v0.4`

**Goal:** Local network does not mean trusted. Encrypt and authenticate everything.

**Tasks**
- [ ] Long-term keypair per device, stored securely (OS keystore where possible, otherwise a file with strict permissions)
- [ ] Pairing flow: user approval plus a short code or QR comparison to defeat man-in-the-middle
- [ ] Trusted-device store (add, list, revoke)
- [ ] Mutually authenticated encrypted channel (TLS 1.3 with pinned certs via `rustls`, or Noise via `snow`)
- [ ] Reject unpaired devices unless the user explicitly approves a one-time transfer
- [ ] Path sanitization: no `..`, absolute paths, reserved names (Windows `CON`, `NUL`…), or symlink escapes; handle name collisions
- [ ] File size and file count limits; disk-space check before accepting
- [ ] Malformed-packet protection and rate limiting on connections and pairing attempts
- [ ] Logs never contain keys, file contents, or full paths where sensitive

**Tests**
- *Unit:* pairing code derivation; trusted-store add/revoke; path sanitizer against a list of hostile names (`../../x`, `C:\Windows\x`, `con.txt`, unicode tricks, very long names).
- *Integration:* unpaired device is refused; revoked device is refused; wrong key is refused.
- *Integration:* a test proxy tampers with encrypted bytes → connection fails and no file is written.
- *Integration:* replayed handshake is rejected.
- *Fuzzing (`cargo-fuzz`):* frame parser, message deserializer, handshake, and discovery parser. Run for a fixed time budget in CI and longer overnight locally.
- *Security review checklist* in `docs/security.md` completed.

**Exit gate:** no crashes in fuzzing for the agreed duration; all hostile-path tests pass; the encrypted-channel tamper test fails safely.

---

## Phase E5 — Engine API Stabilization

**Goal:** Give the future UI a stable, event-driven interface.

**Tasks**
- [ ] Define the public API: `start_engine`, `list_devices`, `send_files`, `accept/reject`, `pause/resume/cancel`, `get_history`
- [ ] Event stream (no polling): `DeviceFound`, `DeviceLost`, `IncomingRequest`, `Progress`, `StateChanged`, `Completed`, `Failed`
- [ ] Config object (download dir, chunk size, limits, device name)
- [ ] Transfer history persistence
- [ ] Keep the API simple and serializable so `flutter_rust_bridge` is easy later
- [ ] Rewrite the CLI as a thin client of this API (proves the API is sufficient)

**Tests**
- *Integration:* the whole flow through the public API only: discover → pair → send → progress events → complete.
- *Unit:* event ordering guarantees (progress is monotonic; exactly one terminal event per transfer).
- *API snapshot test* so accidental breaking changes are caught.

**Exit gate:** the CLI uses nothing but the public API, and all prior integration tests pass unchanged.

---

## Phase E6 — Failure and Network Testing

**Goal:** Prove the engine survives bad networks.

**Tasks**
- [ ] Scripts for network impairment (Linux `tc netem`; Windows `clumsy` or similar) in `scripts/`
- [ ] Test matrix: packet loss 0 / 1 / 5 / 10 %, latency 1 / 20 / 50 / 100 ms
- [ ] Interface-change scenarios (Wi-Fi → Ethernet), Wi-Fi off/on, sleep/wake
- [ ] Disk-full and permission-denied handling on the receiver
- [ ] Very long and unicode filenames; files being modified while sending
- [ ] Clear user-facing error messages for each failure class

**Tests**
- Automated matrix run producing a pass/fail table (committed as `docs/reliability.md`).
- *Scenario tests:* disconnect for 5 s / 60 s → resumes; disconnect beyond the timeout → ends `FAILED` cleanly and the transfer can be resumed manually.
- *Source-file-changed* test: sender detects the change and fails or restarts safely rather than sending a corrupt file.

**Exit gate:** reliability numbers recorded (success rate and resume success rate) with no data corruption in any scenario.

---

## Phase E7 — Stress and Soak Testing

**Goal:** Catch leaks and rare bugs.

**Tasks**
- [ ] Soak test: hundreds of transfers back to back, tracking memory, file handles and threads
- [ ] Concurrency stress: many simultaneous transfers and many simultaneous connection attempts
- [ ] Large-file test: 10 GB+
- [ ] Run under `cargo miri` / sanitizers where practical; clippy at pedantic level for the unsafe-free core
- [ ] Code coverage measured (`cargo-llvm-cov`) with a target for core modules

**Tests**
- Memory and handle counts stay flat across the soak run.
- Core-module coverage target met (suggested ≥ 80% on protocol, transfer, security).

**Exit gate:** the engine is declared **feature-complete and stable on TCP**. Tag `v0.5`. Nothing below starts until this passes.

---

# STAGE B — PERFORMANCE

## Phase P1 — TCP Baseline and File I/O Benchmarks

**Goal:** Know the real numbers before optimizing anything.

**Tasks**
- [ ] Benchmark harness in `benchmarks/` (repeatable scripts plus `criterion` microbenchmarks)
- [ ] File sizes: 100 MB, 500 MB, 1 GB, 5 GB, 10 GB
- [ ] Networks: Wi-Fi 5, Wi-Fi 6, Ethernet (whatever you have; record the hardware)
- [ ] `FileSource` abstraction: `BufferedReader`, `MmapReader`, `ZeroCopyReader` (platform-specific)
- [ ] Tune chunk size, buffer size and socket buffers (`TCP_NODELAY`, send/receive buffer sizes)
- [ ] Metrics: throughput (avg / peak), total time, CPU %, RAM, connection setup time, resume time

**Tests**
- Each `FileSource` implementation must pass the **same** correctness test suite as the default one before being benchmarked.
- Results are reproducible: three runs per scenario, with the median and spread reported.

**Exit gate:** `docs/performance.md` contains real measured tables and a documented choice of default I/O strategy per platform.

---

## Phase P2 — QUIC, then Custom UDP (Research) → `v0.6`

**Goal:** Decide transports from evidence.

**Tasks**
- [ ] Implement a QUIC transport (`quinn`) behind the same transport trait
- [ ] Benchmark QUIC against the TCP baseline on the same files and networks, including under packet loss
- [ ] **Decision record:** adopt QUIC only if it provides a meaningful advantage in the target scenarios
- [ ] Only then, optional custom UDP: packet format, sequence numbers, ACK/NACK, retransmission, flow control, congestion control
- [ ] **Decision record:** custom UDP becomes production only if it shows a measurable advantage without losing reliability or security

**Tests**
- The **entire** E1–E7 integration suite is run against each new transport (the transport trait makes this a parameter).
- UDP: loss, reordering and duplication simulation; congestion-fairness check (it must not starve other traffic).

**Exit gate:** written decisions for QUIC and UDP, backed by the benchmark data.

---

# STAGE C — DESKTOP UI

## Phase U1 — Flutter + Bridge (Windows) → `v0.7`

**Goal:** A thin UI over the finished engine.

**Tasks**
- [ ] Flutter project and `flutter_rust_bridge` setup
- [ ] Riverpod providers: `DeviceProvider`, `TransferProvider`, `SettingsProvider`, `HistoryProvider`
- [ ] Screens: Home / nearby devices, file picker (and drag-and-drop), pairing dialog, transfer progress (speed, ETA, cancel), history (retry), settings
- [ ] Engine events drive the UI through streams. No polling
- [ ] **No networking logic in Dart**

**Tests**
- *Dart unit tests* for providers (with a fake engine).
- *Widget tests* for each screen's states: empty, loading, error, in-progress, done.
- *Integration tests (`integration_test`)*: full send/receive between two app instances on Windows.
- *Bridge tests*: events arrive in order; no UI freeze during a 5 GB transfer; memory stays stable in the UI.

**Exit gate:** the MVP flow works end to end through the UI: Windows ↔ Windows, file selection, progress, SHA-256 verified, errors shown clearly.

---

## Phase U2 — Desktop Polish

**Tasks**
- [ ] System tray, desktop notifications, startup option
- [ ] Windows firewall prompt/guidance and a first-run check
- [ ] Settings: download folder, device name, trusted devices, chunk size (advanced)
- [ ] Accessibility and error-message review
- [ ] Windows installer

**Tests:** manual QA checklist on a clean Windows VM (fresh install, firewall on, no dev tools); UI test run on high-DPI and low-resolution screens.

---

# STAGE D — MOBILE

## Phase M1 — Android → `v0.8`

**Goal:** Reuse the same engine on Android.

**Tasks**
- [ ] Cross-compile the Rust core for Android targets (`cargo-ndk`; arm64-v8a, armeabi-v7a, x86_64 for emulator)
- [ ] Storage: Storage Access Framework / MediaStore; **no legacy storage permissions**; handle content URIs (the engine may need a file-descriptor-based `FileSource`)
- [ ] mDNS on Android: `WifiManager.MulticastLock`, `NsdManager` if needed, plus the UDP fallback
- [ ] Foreground service with a persistent notification for long transfers
- [ ] Handle app lifecycle, battery optimization, Doze, and network changes
- [ ] Permissions for the targeted Android version (nearby devices / notifications)

**Tests**
- Engine test suite runs on an Android emulator and on at least one real device.
- *Manual matrix:* Windows → Android and Android → Windows with 100 MB and 5 GB files; screen off; app backgrounded; Wi-Fi toggled mid-transfer (must resume); low battery mode.
- *Storage tests:* large files from different providers (internal storage, SD card, cloud-backed files).

**Exit gate:** large bidirectional transfers work with the screen off, and interrupted transfers resume.

---

# STAGE E — EXPANSION AND RELEASE

## Phase R1 — Additional Platforms → `v0.9`

| Platform | Key work |
|---|---|
| **Linux** | tray (where supported), notifications, filesystem permissions, packaging (AppImage / deb) |
| **macOS** | local-network permission, Bonjour service declaration, sandbox/file permissions, notarization |
| **iOS** | local-network permission, Bonjour declaration, background-execution limits (do last; treat as optional until the rest is stable) |

**Tests:** run the engine suite natively on each OS in CI; cross-platform transfer matrix (every pair of OSes, large file, with resume).

---

## Phase R2 — Release → `v1.0`

**Tasks**
- [ ] Final security review (`docs/security.md`, `SECURITY.md` with a disclosure process)
- [ ] Final performance report
- [ ] Documentation: README, architecture, protocol, user guide
- [ ] CI/CD release pipeline, code signing, GitHub release
- [ ] Store preparation (Google Play etc.)
- [ ] Crash and error reporting that is **local and opt-in** (no cloud dependency, consistent with the privacy principle)

---

## 5. Testing Strategy Summary

| Level | What it proves | Tools |
|---|---|---|
| Unit | Individual functions behave | `cargo test`, `proptest` |
| Integration | Engine components work together over real sockets | `tokio::test`, `tempfile`, test proxy |
| Fuzz | Parsers survive hostile input | `cargo-fuzz` |
| Chaos / failure | Resume and recovery are correct under kills and bad networks | `tc netem` / `clumsy`, kill scripts |
| Soak / stress | No leaks or rare races | long-running scripts, metrics |
| Benchmark | Real performance numbers | `criterion`, harness scripts |
| UI / E2E | The full stack works for a user | Flutter widget and integration tests |
| Manual device matrix | Real-world networks and devices | checklist in `docs/` |

**Testing rules**
1. Every bug fix adds a regression test.
2. Each new transport or `FileSource` must pass the same shared correctness suite.
3. Always verify with SHA-256 of the real files, never just "it finished".
4. CI must stay green before a milestone is tagged.

---

## 6. Working With AI (Recommended Workflow)

1. Keep this file in the repo and paste the current phase into each AI session.
2. Spec first: have the AI draft `protocol/*.md`, then implement against it.
3. One small task per prompt (for example "write `chunker.rs` with tests"), not "build the engine".
4. Ask for tests first or alongside the code, and run them yourself.
5. After each module, ask the AI to review the diff for bugs, race conditions and security issues, and to explain the design so you understand it.
6. Never accept AI-written cryptography. Use the audited crates.
7. Commit after every working step; tag each milestone.
8. Update the checkboxes in this file as you go.

---

## 7. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Discovery fails on some networks | UDP fallback, manual IP, clear diagnostics |
| Wi-Fi client isolation | Detect and explain; do not claim to bypass |
| Resume bugs corrupt files | Per-chunk hashes, final SHA-256, chaos tests |
| Android background limits | Foreground service, dedicated phase, real-device tests |
| Scope creep (UDP, sync, etc.) | Non-goals list; research is gated by benchmarks |
| Security flaws | Audited crates, fuzzing, pairing with MITM protection, review gate |
| Over-optimizing too early | Gate P1/P2 behind a stable engine (E7) |

---

## 8. Non-Goals (v1.0)

Cloud storage, user accounts, public hosting, internet transfer, NAT traversal, social features, file synchronization, media streaming, centralized servers, remote access.

---

## 9. Definition of Done — v1.0

- **Engine:** reliable, resumable, integrity-verified, cancellable, multi-transfer; stress and failure tested; fuzzed.
- **Discovery:** mDNS, UDP fallback, manual IP, with diagnostics.
- **Security:** pairing, mutual authentication, encryption, path and size validation, malformed-input rejection.
- **Performance:** TCP baseline, I/O strategies, QUIC and UDP evaluated with real data.
- **Platforms:** Windows, Android (then Linux, macOS, iOS as achieved).
- **Release:** documentation, CI/CD, signed builds, security and performance reports.

---

## 10. Research Question

> Can a Rust-based local file-transfer engine using optimized file I/O and adaptive transport strategies provide higher throughput and better resource efficiency than conventional TCP-based local file transfer while maintaining reliability and security?

Answered by Stage B, using only measured data.
