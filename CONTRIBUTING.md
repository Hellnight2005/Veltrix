# Contributing to LocalDrop (Veltrix)

First off, thank you for considering contributing to **LocalDrop**! Open-source contributions, bug reports, performance benchmarks, and feedback make this project better for everyone.

Please take a moment to review this document to ensure a smooth collaboration process.

---

## 📜 Code of Conduct

This project and everyone participating in it is governed by the [LocalDrop Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## 🧭 Core Engineering Principles

Before opening a pull request or submitting changes, keep our core principles in mind:

1. **Engine First**: The Rust core engine (`crates/localdrop_core`) is the foundation. It must remain fully tested, memory-safe, and functional independently of any UI layer.
2. **Zero Cloud Dependencies**: Transfers, handoffs, and video streams must operate 100% locally over LAN / Wi-Fi interfaces. No telemetry or data should ever leave the local network.
3. **Measure First, Optimize Second**: Any performance optimization or transport modification must be accompanied by an empirical benchmark update in [`benchmarks/`](benchmarks/).
4. **Honest About Networks**: Document limitations (e.g. AP Client Isolation on guest Wi-Fi) honestly and provide clear fallback mechanisms (QR codes, Direct IP, Hotspot mode).
5. **No 24/7 Battery Drain**: Background state must persist atomically to non-volatile disk. When paused or idle, the app must consume 0% CPU and 0% battery.

---

## 🛠️ Development Setup & Prerequisites

### 1. Toolchain Requirements
* **Rust**: `1.80+` (stable). Verify with `rustc --version`.
* **Node.js**: `v20+` or `v22+` with npm. Verify with `node -v`.
* **Android SDK** (optional, for APK builds): API 34+ or 35+, with build-tools and JDK 17/21.

### 2. Cloning the Repository
```bash
git clone https://github.com/Hellnight2005/Veltrix.git
cd Veltrix
```

### 3. Running the Rust Core Engine & CLI
```bash
# Run unit and integration tests
cargo test --all

# Run the 14 automated integration tests for Phase E1
cargo test -p localdrop_core --test e1_tcp_transfer

# Start receiver listener
cargo run --release -p localdrop_cli -- receive --port 8080 --out ./inbox

# Send a file to receiver
cargo run --release -p localdrop_cli -- send 127.0.0.1:8080 ./path/to/file.mp4
```

### 4. Running the Mobile Cinema & Cast Web App
```bash
cd apps/localdrop_web
npm install
npm run dev
```
- Open `http://localhost:5173/` in your browser.
- Open `http://<YOUR_LAN_IP>:5173/?mode=tv` to test the TV Client Screen on your laptop or smart TV.
- Open `http://<YOUR_LAN_IP>:5173/?mode=phone` to test the Phone Controller on your mobile device.

### 5. Building the Android APK
```bash
cd apps/localdrop_web
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```
The resulting debug APK will be generated at `apps/localdrop_web/android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 📂 Repository Structure

```text
Veltrix/
├── apps/
│   └── localdrop_web/              # Mobile cinema PWA (Phone Server, TV Client, Shared Gallery)
│       ├── android/                # Native Android Gradle project (Capacitor)
│       ├── src/                    # UI styles, video player, and broadcast sync
│       └── index.html
├── crates/
│   ├── localdrop_core/             # Core Rust engine: TCP transport, 4-byte BE framing, SHA-256
│   └── localdrop_cli/              # CLI runner: `localdrop send` and `localdrop receive`
├── docs/
│   └── PRODUCT_GUIDE.md            # Master system and product specification
├── protocol/                       # Formal protocol specs (framing, handshake, transfer, discovery)
├── benchmarks/                     # Empirical throughput and memory measurements
├── releases/                       # Pre-compiled binaries and standalone Android APKs
└── .github/                        # CI workflows, PR templates, and issue templates
```

---

## 🌿 Git & Branching Strategy

1. **Fork the repository** on GitHub.
2. Create a feature branch off `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
   * Branch naming conventions:
     - `feat/...` for new features
     - `fix/...` for bug fixes
     - `perf/...` for performance optimizations
     - `docs/...` for documentation improvements
     - `refactor/...` for code refactoring

### Conventional Commits
Please use [Conventional Commits](https://www.conventionalcommits.org/) for clean history:
* `feat(engine): add UDP broadcast fallback for peer discovery`
* `fix(mobile): resolve touch scrubber offset on high-DPI displays`
* `perf(core): optimize buffer copy in framing layer`
* `docs(spec): document edge case recovery for socket resets`

---

## 🧪 Testing Checklist

Before submitting a Pull Request, ensure that:
1. `cargo test --all` passes with zero failures.
2. `cargo clippy --all -- -D warnings` reports zero lint warnings.
3. `cargo fmt --check` passes.
4. For web/mobile changes, verify that the responsive layout works on mobile viewports and 10-foot TV viewports.
5. If modifying transport or I/O, run benchmarks and record measurements in `benchmarks/`.

---

## 📬 Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```
2. Open a Pull Request against `main` on the [Veltrix repository](https://github.com/Hellnight2005/Veltrix).
3. Fill out the **Pull Request Template**:
   - Describe what the PR does and why it was needed.
   - Link related issue(s).
   - Attach screenshots or benchmark numbers if applicable.
4. Maintainers will review your PR and provide constructive feedback!

---

## 💡 Ways to Contribute

Not sure where to start? Check our roadmap:
- 🦀 **Phase E2**: Configurable chunk sizes and proptest property tests.
- 📡 **Phase E3**: Full mDNS advertising/browsing via `mdns-sd` crate.
- 🔐 **Phase E4**: Noise Protocol (`snow` crate) authenticated pairing and encrypted transport.
- 📺 **TV Client**: WebOS and Tizen native packaging.
- 🌐 **Translations**: Localizing the mobile UI into other languages.

Thank you for contributing to LocalDrop! 🌟
