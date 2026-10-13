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

*   [docs/PRODUCT_GUIDE.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/docs/PRODUCT_GUIDE.md) - **Full Product & System Guide**: What happens on each step, edge cases, networking, and lifecycle diagrams.
*   [PROJECT_PLAN.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/PROJECT_PLAN.md) - The full project plan, architecture specifications, milestones, and goals.
*   [ENGINE_PLAN.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/ENGINE_PLAN.md) - Engine-first Rust implementation roadmap and phase specifications.
*   [benchmarks/tcp_baseline.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/benchmarks/tcp_baseline.md) - Phase E1 baseline throughput benchmarks (73.15 MB/s).
*   [CONTRIBUTING.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/CONTRIBUTING.md) - Developer setup guide and codebase contribution workflows.
*   [SECURITY.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/SECURITY.md) - Security policies, threat model, and vulnerability reporting.
*   [CHANGELOG.md](file:///c:/Users/Abhijeet/Desktop/Veltrix/CHANGELOG.md) - Project milestone history and updates.

## 🏗️ Project Structure

The project is structured as a monorepo containing:

```text
localdrop/
├── apps/
│   └── localdrop_web/        # Mobile cinema web app (stop-and-handoff video streaming)
├── crates/
│   ├── localdrop_core/       # Core Rust networking engine (TCP, framing, SHA-256)
│   └── localdrop_cli/        # High-performance CLI transfer tool
├── protocol/                 # Formal protocol specifications (framing, handshake, etc.)
├── docs/                     # Architectural, system, and product documentation
└── benchmarks/               # Transport & File I/O performance benchmarks
```

## 🛠️ Getting Started

### 1. Running the Mobile Cinema Web App
```bash
cd apps/localdrop_web
npm run dev
```
Open `http://localhost:5173/` or test on your phone over Wi-Fi (`http://<YOUR_LAN_IP>:5173/`).

### 2. Running the Rust Core CLI
```bash
# Start receiver listener
cargo run --release -p localdrop_cli -- receive --port 8080 --out ./inbox

# Send file over local network
cargo run --release -p localdrop_cli -- send 127.0.0.1:8080 ./path/to/movie.mp4
```

### 3. Running Engine Test Suite
```bash
cargo test -p localdrop_core --test e1_tcp_transfer
```
