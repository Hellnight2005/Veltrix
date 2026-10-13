# LocalDrop (Veltrix) 🚀

[![CI](https://github.com/Hellnight2005/Veltrix/actions/workflows/ci.yml/badge.svg)](https://github.com/Hellnight2005/Veltrix/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.80%2B-orange.svg)](https://www.rust-lang.org/)
[![Android APK](https://img.shields.io/badge/Release-APK%20v1.0-brightgreen.svg)](releases/LocalDrop-v1.0-debug.apk)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **LocalDrop** is a privacy-first, cross-platform peer-to-peer (P2P) local file transfer and media streaming system. It combines a high-performance **Rust core engine** with an intuitive **Mobile Cinema & Cast App** featuring seamless **stop-and-handoff video playback** across phones, laptops, and smart TVs on a local area network (LAN).

---

## 🌟 Key Highlights

* **Zero Cloud Dependencies**: 100% direct peer-to-peer over local Wi-Fi or Ethernet. No relays, no external servers, no tracking.
* **Phone as Media Server & Remote**: Stream videos directly from your phone's camera roll or storage to any TV or laptop screen at **78+ MB/s**.
* **Stop & Stream Handoff**: Pause a movie on your phone (e.g. at `04:18`) $\rightarrow$ instantly pick a nearby screen and continue playing from that exact second with zero position loss.
* **Shared Phone Gallery on TV**: Your phone's media library renders as a shared gallery tray directly on the TV screen. Browse and switch movies using either your phone or the TV!
* **Zero 24/7 Battery Drain**: The paused timestamp is saved atomically to non-volatile disk. When closed or paused, LocalDrop uses **0% CPU, 0% RAM, and 0% Battery**.
* **Resilient Engine**: On-the-fly streaming SHA-256 validation, resume manifests (`.part.manifest`) with missing-chunk reconciliation, and strict path traversal defense against malicious payloads.
* **Blazing Fast**: Measured **73.15 MB/s** baseline TCP throughput with bounded $O(\text{chunk\_size})$ memory footprint.

---

## 📱 Try the Android App

Download the standalone native Android APK (**LocalDrop v1.0**):
* 📦 **[Download LocalDrop-v1.0-debug.apk](releases/LocalDrop-v1.0-debug.apk)** *(Size: 4.1 MB)*

---

## 📊 Benchmark Summary

Tested on physical hardware with continuous streaming SHA-256 calculation:

| Payload Size | Chunk Size | Wall Clock Time | Measured Throughput | Memory Footprint | SHA-256 Match |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **100 MB** | 1 MB | 1.36s | **73.15 MB/s** | Flat $< 25\text{ MB}$ RSS | ✅ Verified (`998fa39f...`) |
| **1 GB** | 1 MB | 14.23s | **71.93 MB/s** | Flat $< 25\text{ MB}$ RSS | ✅ Verified (`e18e3f35...`) |

*Detailed benchmark logs and hardware specs: [benchmarks/tcp_baseline.md](benchmarks/tcp_baseline.md)*.

---

## 🛠️ Quick Start

### 1. Run the Mobile Cinema & Cast Web App
```bash
cd apps/localdrop_web
npm install
npm run dev
```
* **Laptop / TV Receiver View**: Open `http://localhost:5173/?mode=tv` (Press `F11` for 10-foot cinema view).
* **Phone Controller View**: Open `http://<YOUR_LAN_IP>:5173/?mode=phone` on your mobile browser.
* **Dual Side-by-Side Simulation**: Open `http://localhost:5173/`.

### 2. Run the High-Performance Rust CLI
```bash
# Terminal 1: Start receiver daemon listening on port 8080
cargo run --release -p localdrop_cli -- receive --port 8080 --out ./inbox

# Terminal 2: Send a file over local network
cargo run --release -p localdrop_cli -- send 127.0.0.1:8080 ./path/to/movie.mp4
```

### 3. Run Automated Integration Test Suite
```bash
cargo test -p localdrop_core --test e1_tcp_transfer
```
Validates 14 test cases including chunk boundary handling, corrupted byte detection, unexpected socket disconnects, and version mismatch rejections.

---

## 🏗️ Monorepo Structure

```text
Veltrix/
├── apps/
│   └── localdrop_web/        # Mobile cinema PWA (Phone Server, TV Client, Shared Gallery)
│       └── android/          # Native Android Gradle project (Capacitor)
├── crates/
│   ├── localdrop_core/       # Core Rust networking engine (TCP, framing, SHA-256)
│   └── localdrop_cli/        # High-performance CLI transfer tool
├── protocol/                 # Formal protocol specifications (framing, handshake, etc.)
├── docs/                     # Architectural specifications and comprehensive system guides
├── benchmarks/               # Empirical throughput and memory measurements
├── releases/                 # Standalone Android APKs and binaries
└── .github/                  # CI workflows, PR templates, and issue templates
```

---

## 📚 Documentation

* 📖 [**docs/PRODUCT_GUIDE.md**](docs/PRODUCT_GUIDE.md) — Complete System & Product Guide (What happens on every step & all 11 edge cases).
* 🦀 [**ENGINE_PLAN.md**](ENGINE_PLAN.md) — Rust core engine implementation roadmap.
* 📏 [**benchmarks/tcp_baseline.md**](benchmarks/tcp_baseline.md) — Baseline throughput benchmarks.
* 📜 [**protocol/README.md**](protocol/README.md) — Binary protocol and packet framing specifications.

---

## 🤝 Contributing

We welcome community contributions, bug reports, feature requests, and benchmark submissions!
* Please read [**CONTRIBUTING.md**](CONTRIBUTING.md) for environment setup and contribution guidelines.
* Review our [**Code of Conduct**](CODE_OF_CONDUCT.md).
* For vulnerability reports, see [**SECURITY.md**](SECURITY.md).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
