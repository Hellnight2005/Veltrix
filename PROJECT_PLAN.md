# LocalDrop — Project Plan

> **LocalDrop** is a privacy-first, cross-platform peer-to-peer file transfer application designed for fast, reliable transfers over local networks, using Flutter for the user interface and Rust for the networking and transfer engine.

---

## 1. Project Overview

### 1.1 Project Name

**LocalDrop**

### 1.2 Project Type

Cross-platform peer-to-peer local file transfer application.

### 1.3 Core Technologies

- **Frontend:** Flutter / Dart
- **Native Core:** Rust
- **FFI Bridge:** `flutter_rust_bridge`
- **Async Runtime:** Tokio
- **Device Discovery:** mDNS + UDP fallback
- **Initial Transport:** TCP
- **Advanced Transport:** QUIC
- **Experimental Transport:** Custom UDP
- **File Integrity:** SHA-256
- **File I/O:** Buffered I/O, `mmap`, and platform-specific zero-copy APIs where beneficial
- **State Management:** Riverpod
- **CI/CD:** GitHub Actions

---

# 2. Vision

LocalDrop aims to provide a simple way to transfer files directly between nearby devices without requiring cloud storage or a centralized file-transfer server.

The application should prioritize:

1. **Privacy**
2. **Reliability**
3. **Performance**
4. **Cross-platform compatibility**
5. **Simple user experience**

The application should not require a cloud backend for normal local file transfers.

---

# 3. Problem Statement

Existing local file-transfer solutions can encounter problems involving:

- unreliable device discovery;
- network-interface changes;
- VPN interference;
- multicast restrictions;
- Wi-Fi client isolation;
- interrupted transfers;
- large-file memory usage;
- lack of transfer resume;
- inconsistent performance across networks.

LocalDrop will investigate whether a Rust-based native networking engine can provide a reliable and high-performance alternative.

> **Important:** LocalDrop will not claim to bypass network restrictions such as Wi-Fi client isolation. If the network prevents peer-to-peer communication, the application should detect and report the problem.

---

# 4. Project Objectives

## 4.1 Primary Objectives

- Transfer files directly between devices on a local network.
- Automatically discover nearby LocalDrop devices.
- Provide manual IP-based connection as a fallback.
- Support large files.
- Provide transfer progress.
- Support interrupted-transfer recovery.
- Verify file integrity.
- Authenticate paired devices.
- Encrypt transfers.
- Minimize unnecessary memory usage.
- Provide cross-platform support.
- Benchmark different transport and file-I/O strategies.

---

# 5. Non-Goals

The first version will not attempt to implement:

- Cloud storage
- User accounts
- Public file hosting
- Internet-based file transfer
- Social features
- File synchronization
- Media streaming
- Centralized transfer servers
- NAT traversal
- Remote-access functionality

These features may be considered after the core system is stable.

---

# 6. System Architecture

```text
┌───────────────────────────────────────────────────────────┐
│                     FLUTTER APPLICATION                   │
│                                                           │
│  Home │ Devices │ File Picker │ Transfers │ History       │
│                                                           │
└──────────────────────────┬────────────────────────────────┘
                           │
                           │ flutter_rust_bridge
                           ▼
┌───────────────────────────────────────────────────────────┐
│                       RUST CORE                            │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ Discovery    │  │ Protocol     │  │ Transfer       │ │
│  │ Manager      │  │ Manager      │  │ Manager        │ │
│  └──────────────┘  └──────────────┘  └────────────────┘ │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ Network      │  │ File I/O     │  │ Security       │ │
│  │ Manager      │  │ Manager      │  │ Manager        │ │
│  └──────────────┘  └──────────────┘  └────────────────┘ │
│                                                           │
└──────────────────────────┬────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
             mDNS         TCP          QUIC
              │            │            │
              │            └─────┬──────┘
              │                  │
              │          Experimental
              │                  │
              │                 UDP
              │
        Device Discovery
```

---

# 7. Architectural Principles

## 7.1 Flutter Is the Presentation Layer

Flutter is responsible for:

- UI
- animations
- user interaction
- file selection UI
- displaying device information
- displaying transfer state
- application settings

Flutter should not contain the core networking implementation.

---

## 7.2 Rust Is the Core Engine

Rust is responsible for:

- networking
- device discovery
- protocol implementation
- file transfer
- hashing
- transfer recovery
- security
- network state
- performance-critical operations

---

## 7.3 No Cloud Dependency

Normal transfers should follow:

```text
Device A
   │
   │ Local Network
   │
   ▼
Device B
```

and not:

```text
Device A
   │
   ▼
Cloud Server
   │
   ▼
Device B
```

---

# 8. Repository Structure

```text
localdrop/
│
├── apps/
│   └── localdrop_flutter/
│       ├── lib/
│       │   ├── screens/
│       │   ├── widgets/
│       │   ├── providers/
│       │   ├── models/
│       │   └── services/
│       │
│       └── pubspec.yaml
│
├── crates/
│   └── localdrop_core/
│       ├── src/
│       │   ├── discovery/
│       │   │   ├── mod.rs
│       │   │   ├── mdns.rs
│       │   │   └── udp.rs
│       │   │
│       │   ├── protocol/
│       │   │   ├── mod.rs
│       │   │   ├── handshake.rs
│       │   │   ├── messages.rs
│       │   │   └── version.rs
│       │   │
│       │   ├── transport/
│       │   │   ├── mod.rs
│       │   │   ├── tcp.rs
│       │   │   ├── quic.rs
│       │   │   └── udp.rs
│       │   │
│       │   ├── transfer/
│       │   │   ├── mod.rs
│       │   │   ├── sender.rs
│       │   │   ├── receiver.rs
│       │   │   ├── chunker.rs
│       │   │   └── resume.rs
│       │   │
│       │   ├── storage/
│       │   │   ├── mod.rs
│       │   │   └── file.rs
│       │   │
│       │   ├── security/
│       │   │   ├── mod.rs
│       │   │   └── identity.rs
│       │   │
│       │   ├── error.rs
│       │   └── lib.rs
│       │
│       └── Cargo.toml
│
├── protocol/
│   ├── README.md
│   ├── discovery.md
│   ├── handshake.md
│   ├── transfer.md
│   └── errors.md
│
├── benchmarks/
│   ├── tcp/
│   ├── quic/
│   └── udp/
│
├── docs/
│   ├── architecture.md
│   ├── networking.md
│   ├── security.md
│   └── performance.md
│
├── scripts/
│
├── .github/
│   └── workflows/
│
├── README.md
├── PROJECT_PLAN.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
└── LICENSE
```

---

# 9. Device Discovery

LocalDrop will use multiple discovery mechanisms.

## 9.1 mDNS

Primary discovery mechanism.

Service:

```text
_localdrop._tcp
```

The advertised metadata should include:

```json
{
  "device_id": "UUID",
  "device_name": "Abhijeet-PC",
  "platform": "windows",
  "port": 8080,
  "protocol_version": 1
}
```

---

## 9.2 UDP Discovery

UDP discovery will act as a fallback where appropriate.

Example:

```text
DISCOVER_LOCALDROP
```

A LocalDrop device responds with its connection information.

---

## 9.3 Manual IP

Users should be able to connect manually:

```text
192.168.1.42:8080
```

This is important when discovery is unavailable.

---

# 10. Device Identity

Each installation should have a persistent device identity.

```text
Device ID
    ↓
UUID
```

Example:

```json
{
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "device_name": "Abhijeet-PC",
  "platform": "windows"
}
```

The device's MAC address should not be used as the primary identity.

---

# 11. Transfer Protocol

The initial protocol will use TCP.

```text
Sender                         Receiver

   │                              │
   │──── CONNECT ────────────────>│
   │                              │
   │<──── HELLO ─────────────────│
   │                              │
   │──── CAPABILITIES ───────────>│
   │                              │
   │<──── ACCEPT ────────────────│
   │                              │
   │──── FILE_METADATA ──────────>│
   │                              │
   │<──── READY ─────────────────│
   │                              │
   │──── FILE_DATA ──────────────>│
   │                              │
   │<──── COMPLETE ──────────────│
   │                              │
```

---

# 12. File Metadata

Example:

```json
{
  "transfer_id": "UUID",
  "filename": "video.mp4",
  "size": 5368709120,
  "sha256": "HASH",
  "chunk_size": 1048576
}
```

Metadata should be validated before the transfer begins.

---

# 13. File Chunking

Large files should be divided into logical application-level chunks.

```text
File
 │
 ├── Chunk 0
 ├── Chunk 1
 ├── Chunk 2
 ├── Chunk 3
 └── ...
```

The application-level chunk size should be configurable and benchmarked.

Transport-level packetization should remain the responsibility of the transport protocol.

---

# 14. Transfer States

Every transfer should have an explicit state.

```text
QUEUED
  ↓
CONNECTING
  ↓
AUTHENTICATING
  ↓
PREPARING
  ↓
TRANSFERRING
  ↓
VERIFYING
  ↓
COMPLETED
```

Failure path:

```text
TRANSFERRING
      ↓
INTERRUPTED
      ↓
RECONNECTING
      ↓
RESUMING
      ↓
TRANSFERRING
```

Other states:

```text
CANCELLED
FAILED
RETRYING
```

---

# 15. Resume Support

Resume should be part of the core architecture.

Example:

```text
5 GB File

██████████████░░░░░░
        3.5 GB
```

After disconnection:

```text
Resume from:
3.5 GB
```

For chunk-based transfers:

```text
[✓][✓][✓][✓][✓][✓][✗][✗][✗]
```

The receiver can identify missing chunks and request retransmission.

---

# 16. File Integrity

LocalDrop must verify the final file.

Primary mechanism:

```text
SHA-256
```

Process:

```text
Original File
      ↓
SHA-256
      ↓
Transfer
      ↓
Received File
      ↓
SHA-256
      ↓
Compare
```

If hashes differ:

```text
TRANSFER_FAILED_INTEGRITY
```

---

# 17. Security Architecture

Local network access must not automatically imply trust.

```text
Discovery
   ↓
Device Found
   ↓
User Approval
   ↓
Pairing
   ↓
Authentication
   ↓
Encrypted Connection
   ↓
Transfer
```

Security requirements:

- Device authentication
- Encrypted transfer
- Explicit pairing
- Secure random identities
- Protocol version validation
- Input validation
- File path sanitization
- File size validation
- Malformed packet protection
- Rate limiting where appropriate

---

# 18. File I/O Strategy

LocalDrop should not assume that `mmap` is automatically faster.

Benchmark:

```text
Buffered I/O
      vs
Memory Mapping
      vs
Platform-specific zero-copy APIs
```

The Rust engine should abstract the file source:

```text
FileSource
├── BufferedReader
├── MmapReader
└── ZeroCopyReader
```

The implementation should select the most appropriate strategy for each platform.

---

# 19. Transport Strategy

The project will use a staged transport strategy.

## Stage 1 — TCP

TCP will provide the initial reliable baseline.

```text
TCP
├── Connection
├── Metadata
├── Control
└── File Data
```

---

## Stage 2 — QUIC

QUIC will be evaluated as an alternative transport.

```text
QUIC
├── Encryption
├── Reliability
├── Streams
└── Congestion Control
```

---

## Stage 3 — Custom UDP

Custom UDP is an experimental research component.

It may implement:

- sequence numbers;
- acknowledgements;
- negative acknowledgements;
- retransmission;
- flow control;
- congestion control;
- packet loss detection.

The custom UDP implementation will only become a production transport if benchmarks demonstrate a meaningful advantage.

---

# 20. Performance Benchmarking

Performance claims must be based on measurements.

## File sizes

```text
100 MB
500 MB
1 GB
5 GB
10 GB
```

## Network environments

```text
Wi-Fi 5
Wi-Fi 6
Wi-Fi 6E
Ethernet
```

## Metrics

- Average throughput
- Peak throughput
- Total transfer time
- CPU utilization
- Memory utilization
- Packet loss
- Retransmission rate
- Connection establishment time
- Resume time

Example benchmark table:

|Transport|File Size|Time|Avg Speed|CPU|RAM|
|---|--:|--:|--:|--:|--:|
|TCP|1 GB|TBD|TBD|TBD|TBD|
|QUIC|1 GB|TBD|TBD|TBD|TBD|
|UDP|1 GB|TBD|TBD|TBD|TBD|

No benchmark values should be published until they have been measured.

---

# 21. Network Failure Testing

The application must be tested under adverse conditions.

## Packet loss

```text
0%
1%
5%
10%
```

## Latency

```text
1 ms
20 ms
50 ms
100 ms
```

## Connection interruption

```text
Transfer
   ↓
Network disconnected
   ↓
Network restored
   ↓
Transfer resumed
```

## Network interface changes

```text
Wi-Fi
  ↓
Ethernet
```

The application should detect network changes and attempt recovery where possible.

---

# 22. Flutter UI

## Home Screen

```text
LocalDrop

Nearby Devices

💻 Abhijeet-PC
📱 Android Phone
💻 Laptop

[ Send Files ]
```

## File Selection

```text
Select Files

Documents
Images
Videos
Folders

[ Send ]
```

## Transfer Screen

```text
Sending video.mp4

██████████████░░░░

3.2 GB / 5 GB

Speed: 118 MB/s
ETA: 15 seconds

[ Cancel ]
```

## History

```text
Transfer History

✓ video.mp4
✓ photos.zip
✕ backup.tar

[ Retry ]
```

---

# 23. Flutter State Management

Recommended structure:

```text
DeviceProvider
TransferProvider
SettingsProvider
HistoryProvider
```

Example:

```text
Flutter UI
    ↓
Provider
    ↓
Rust Bridge
    ↓
Rust Engine
```

Flutter should receive events from Rust rather than repeatedly polling the native engine.

---

# 24. Platform Support

## Phase 1

- Windows

## Phase 2

- Android

## Phase 3

- Linux

## Phase 4

- macOS

## Phase 5

- iOS

Platform-specific behavior must be isolated behind Rust/Flutter abstractions where practical.

---

# 25. Android Requirements

The Android implementation will need to handle:

- local-network communication;
- modern storage APIs;
- foreground/background transfer constraints;
- battery restrictions;
- application lifecycle;
- Wi-Fi behavior;
- notification requirements for long-running transfers.

Permissions should be implemented according to the Android version being targeted rather than copying legacy storage permissions.

---

# 26. Desktop Requirements

### Windows

- system tray
- drag and drop
- firewall considerations
- startup behavior

### Linux

- system tray where supported
- desktop notifications
- filesystem permissions

### macOS

- local network permission
- Bonjour service declaration
- filesystem permissions

### iOS

- local network permission
- Bonjour service declaration
- background execution constraints

---

# 27. Observability

The Rust engine should produce structured logs.

Example:

```text
INFO  discovery.device_found
INFO  transfer.started
INFO  transfer.progress
WARN  connection.interrupted
INFO  transfer.resumed
WARN  packet.retransmission
INFO  transfer.completed
ERROR transfer.failed
```

Sensitive information must not be written to logs.

---

# 28. Testing Strategy

## Unit Tests

Test:

- chunking;
- hashing;
- protocol serialization;
- protocol parsing;
- state transitions;
- resume calculations;
- error handling.

## Integration Tests

Test:

```text
Sender
   ↓
Rust Network Engine
   ↓
Receiver
```

## End-to-End Tests

Test:

```text
Flutter
   ↓
Rust
   ↓
Network
   ↓
Rust
   ↓
Flutter
```

## Stress Tests

Test:

- large files;
- multiple simultaneous transfers;
- repeated connection failures;
- high packet loss;
- low available bandwidth.

---

# 29. Development Phases

## Phase 0 — Specification

**Goal:** Define the system before implementation.

### Tasks

- Finalize architecture
- Define protocol
- Define security model
- Define transfer states
- Define benchmark methodology
- Create repository

### Deliverable

Complete technical specification.

---

## Phase 1 — Rust TCP Prototype

**Goal:** Transfer a file between two computers.

### Tasks

- TCP server
- TCP client
- Handshake
- Metadata exchange
- File transfer
- SHA-256
- Progress
- Error handling

### Success Criteria

A 5 GB file can be transferred successfully without corruption.

---

## Phase 2 — Transfer Engine

### Tasks

- Chunking
- Resume
- Cancellation
- Retry
- Integrity verification
- Transfer states
- Multiple transfers

---

## Phase 3 — Discovery

### Tasks

- mDNS
- UDP discovery fallback
- Device identity
- Device registry
- Manual IP connection

### Success Criteria

Two LocalDrop devices on the same reachable network discover each other automatically.

---

## Phase 4 — Flutter Integration

### Tasks

- Flutter project
- `flutter_rust_bridge`
- Device UI
- File picker
- Transfer UI
- Progress events
- History UI

---

## Phase 5 — Security

### Tasks

- Pairing
- Device authentication
- Encryption
- Trusted device management
- Input validation
- Secure file handling

---

## Phase 6 — Performance

### Tasks

- TCP baseline
- Buffered I/O benchmark
- mmap benchmark
- Zero-copy investigation
- CPU benchmark
- RAM benchmark
- Throughput benchmark

---

## Phase 7 — QUIC

### Tasks

- QUIC implementation
- Transfer compatibility
- Benchmark
- Compare against TCP

### Decision

Use QUIC in production only if it provides meaningful advantages for LocalDrop's target scenarios.

---

## Phase 8 — Custom UDP Research

### Tasks

- Packet format
- Sequence numbers
- ACK
- NACK
- Retransmission
- Flow control
- Congestion control
- Packet-loss testing
- Benchmark

### Decision

Custom UDP becomes a production option only if it demonstrates a measurable advantage over TCP/QUIC without sacrificing reliability or security.

---

## Phase 9 — Android

### Tasks

- Android integration
- Storage handling
- Local network permissions
- Foreground transfers
- Notifications
- Lifecycle handling
- Device-to-device testing

---

## Phase 10 — Additional Platforms

- Linux
- macOS
- iOS

---

## Phase 11 — Release Preparation

### Tasks

- Security review
- Performance benchmarks
- Documentation
- Crash/error handling
- CI/CD
- Release builds
- Code signing
- GitHub release
- Google Play preparation

---

# 30. Milestone Plan

|Version|Milestone|Status|
|---|---|---|
|`v0.1`|Rust TCP prototype|⬜|
|`v0.2`|File transfer engine|⬜|
|`v0.3`|mDNS discovery|⬜|
|`v0.4`|Flutter desktop UI|⬜|
|`v0.5`|Resume + integrity|⬜|
|`v0.6`|Security + pairing|⬜|
|`v0.7`|Android support|⬜|
|`v0.8`|Performance optimization|⬜|
|`v0.9`|QUIC/UDP research|⬜|
|`v1.0`|Stable release|⬜|

---

# 31. Definition of Done — v1.0

LocalDrop 1.0 is considered complete when:

### Core

- File transfers work reliably.
- Large files are supported.
- Transfers can resume.
- File integrity is verified.
- Transfers can be cancelled.
- Multiple transfers can be managed.

### Discovery

- mDNS discovery works.
- UDP discovery fallback works where supported.
- Manual IP connection works.

### Security

- Devices can be paired.
- Connections are authenticated.
- Transfers are encrypted.
- Filesystem paths are validated.
- Malformed protocol messages are rejected.

### Performance

- TCP baseline is measured.
- File-I/O strategies are benchmarked.
- QUIC is evaluated.
- UDP is evaluated experimentally.
- CPU and RAM usage are measured.

### Platforms

- Windows
- Android
- Linux
- macOS
- iOS

### Release

- GitHub repository
- Documentation
- CI/CD
- Signed releases
- Security documentation
- Performance report
- Google Play release

---

# 32. Success Metrics

The project should be evaluated using measurable metrics rather than marketing claims.

### Reliability

```text
Successful transfers / Total transfers
```

### Throughput

```text
Transferred bytes / Transfer duration
```

### Resume reliability

```text
Successfully resumed transfers / Interrupted transfers
```

### Resource efficiency

Measure:

```text
CPU %
RAM MB
Energy usage where measurable
```

### Discovery

Measure:

```text
Average discovery time
Discovery success rate
```

---

# 33. Research Question

The advanced research component of LocalDrop is:

> **Can a Rust-based local file-transfer engine using optimized file I/O and adaptive transport strategies provide higher throughput and better resource efficiency than conventional TCP-based local file transfer while maintaining reliability and security?**

This question will be evaluated through controlled benchmarks.

---

# 34. Important Engineering Decisions

### Decision 1

**TCP is the initial baseline.**

Do not start with custom UDP.

### Decision 2

**QUIC will be evaluated before custom UDP.**

### Decision 3

**`mmap` is an optimization candidate, not a guaranteed zero-copy solution.**

### Decision 4

**Performance claims will only be made from real benchmarks.**

### Decision 5

**Discovery does not equal trust.**

A discovered device must still be authenticated/presented for approval.

### Decision 6

**Wi-Fi isolation cannot be bypassed by the application.**

The application should detect and explain the problem.

### Decision 7

**The MVP should prioritize correctness over maximum performance.**

---

# 35. Initial MVP Scope

The first usable version should contain only:

```text
Flutter
   │
   ▼
Rust
   │
   ▼
TCP
   │
   ▼
File Transfer
```

Features:

- Windows ↔ Windows
- Manual device connection
- File selection
- File transfer
- Progress
- SHA-256 verification
- Basic error handling

Once this works reliably, expand the system.

---

# 36. Final Product Architecture

```text
                         LOCALDROP
                            │
                ┌───────────┴───────────┐
                │                       │
           Flutter UI              Rust Core
                │                       │
                │               ┌───────┴────────┐
                │               │                │
                │          Discovery         Transfer
                │               │                │
                │          ┌────┴────┐      ┌────┴────┐
                │          │         │      │         │
                │         mDNS      UDP    TCP       QUIC
                │                              │
                │                              │
                └──────── flutter_rust_bridge ┘
                                               │
                                               ▼
                                         File System
```

---

# 37. Long-Term Roadmap

After v1.0, potential features include:

- LAN folder synchronization;
- QR-code pairing;
- drag-and-drop transfer;
- clipboard sharing;
- device-to-device clipboard;
- multi-device transfers;
- transfer scheduling;
- adaptive transport selection;
- network-quality detection;
- bandwidth limiting;
- transfer prioritization;
- advanced diagnostics;
- plugin architecture.

These should remain outside the initial MVP.

---

# 38. Final Project Principle

LocalDrop should be developed according to the following sequence:

```text
Correctness
    ↓
Reliability
    ↓
Security
    ↓
Measurement
    ↓
Optimization
    ↓
Cross-platform expansion
    ↓
Production release
```

The central engineering principle is:

> **Measure first, optimize second.**

LocalDrop should not assume that custom UDP, `mmap`, or zero-copy I/O is faster. The project will implement a reliable baseline, measure real-world performance, and then introduce lower-level optimizations only when the data demonstrates that they provide a meaningful benefit.
