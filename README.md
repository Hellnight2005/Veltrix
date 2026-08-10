# LocalDrop (Veltrix)

LocalDrop is a privacy-first, cross-platform peer-to-peer file transfer application designed for fast, reliable transfers over local networks, utilizing Flutter for the frontend user interface and a custom high-performance Rust core engine.

## 🚀 Key Features

*   **Zero Cloud Dependencies:** All transfers occur directly between devices on the local network.
*   **Privacy-First:** Secure pairing, encrypted transfers, and authenticated device connections.
*   **mDNS Discovery:** Automatic discovery of nearby LocalDrop instances, with UDP and manual IP connection fallbacks.
*   **High Performance:** Optimized Rust core utilizing buffered I/O, memory mapping (`mmap`), and TCP/QUIC transport strategies.
*   **Reliable Resuming:** Large-file chunking with transfer state management and interruption recovery.

## 📂 Documentation

Detailed information and plans are available in the following documents:

*   [PROJECT_PLAN.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/PROJECT_PLAN.md) - The full project plan, architecture specifications, milestones, and goals.
*   [CONTRIBUTING.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/CONTRIBUTING.md) - Developer setup guide and codebase contribution workflows.
*   [SECURITY.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/SECURITY.md) - Security policies, threat model, and vulnerability reporting.
*   [CHANGELOG.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/CHANGELOG.md) - Project milestone history and updates.

## 🏗️ Project Structure

The project is structured as a monorepo containing:

```text
localdrop/
├── apps/
│   └── localdrop_flutter/    # Flutter presentation layer
├── crates/
│   └── localdrop_core/       # Core Rust networking engine
├── protocol/                 # Protocol specifications
├── docs/                     # Architectural and technical documentation
└── benchmarks/               # Transport & File I/O performance benchmarks
```

## 🛠️ Getting Started

### Prerequisites

*   [Flutter SDK](https://docs.flutter.dev/get-started/install) (latest stable version)
*   [Rust toolchain](https://www.rust-lang.org/tools/install) (latest stable version)
*   [`flutter_rust_bridge_codegen`](https://cjycode.com/flutter_rust_bridge/quickstart.html) CLI tool

### Running the App

Refer to the [CONTRIBUTING.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/CONTRIBUTING.md) file for step-by-step instructions on setting up your local development environment and compiling the Rust core bridge.
