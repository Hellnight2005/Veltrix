# LocalDrop (Veltrix) — Deployment & Getting Started Guide

This guide walks you through running LocalDrop across all supported platforms (Web, Android APK, Rust CLI) and publishing the project showcase via **GitHub Pages**.

---

## 1. 🌐 How to Enable GitHub Pages (Step-by-Step)

The project includes a fully built, interactive, standalone showcase site located in the `/docs` folder of this repository.

To make the site live on `https://<your-username>.github.io/Veltrix/`:

### Step 1: Open Repository Settings
1. Navigate to your repository on GitHub:
   ```
   https://github.com/Hellnight2005/Veltrix
   ```
2. Click on the **Settings** tab in the top navigation bar.

### Step 2: Navigate to Pages
1. In the left-hand sidebar under the **Code and automation** section, click on **Pages**.

### Step 3: Configure Build and Deployment
1. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch` from the dropdown.
2. Under **Branch**:
   - Select your main branch (e.g. `main` or `feature/airdrop-media-stream`).
   - In the folder dropdown right next to it, change `/(root)` to **/docs**.
3. Click **Save**.

### Step 4: Verification
1. GitHub Actions will automatically initiate the Pages deployment workflow.
2. Within 1–2 minutes, your website will be live at:
   ```
   https://hellnight2005.github.io/Veltrix/
   ```
3. Visit the URL to verify that all screenshots, interactive mode tabs, benchmarks, and APK download links render smoothly.

---

## 2. 💻 Running the Web & Mobile App Locally

### Prerequisites
- Node.js 18.x or 20.x
- npm 9.x or later

### Installation & Launch
```bash
# 1. Navigate to the web application directory
cd apps/localdrop_web

# 2. Install dependencies
npm install

# 3. Start the local development server
npm run dev
```

The console will output your local network address:
```
  VITE v6.x.x  ready in 240 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.0.103:5173/
```

### Accessing Different Views

| Mode | URL | Purpose |
| :--- | :--- | :--- |
| **Dual View Simulation** | `http://localhost:5173/` | Side-by-side Phone and TV display for testing stream handoff. |
| **Send Files Hub** | `http://localhost:5173/?feature=files` | P2P drag-and-drop file transfer workspace. |
| **TV Screen Client** | `http://localhost:5173/?mode=tv` | Fullscreen 10-foot cinema viewport with on-screen HUD. |
| **Phone Remote Controller** | `http://<LAN_IP>:5173/?mode=phone` | Mobile touch interface for controlling media playback. |

### Building for Production
```bash
npm run build
```
Generates optimized static assets in `dist/`.

---

## 3. 🦀 High-Performance Rust CLI & Core Engine

### Prerequisites
- Rust 1.80+ (`cargo` and `rustc`)

### Running the Receiver Daemon
```bash
# Start receiver listening on port 8080 and saving to ./inbox
cargo run --release -p localdrop_cli -- receive --port 8080 --out ./inbox
```

### Sending a File
```bash
# Send a file to the receiver over local network
cargo run --release -p localdrop_cli -- send 127.0.0.1:8080 ./path/to/movie.mp4
```

### Running Tests
```bash
# Run all core integration tests (corrupt bytes, bounds, timeouts)
cargo test -p localdrop_core --test e1_tcp_transfer
```

---

## 4. 📱 Building the Standalone Android App

### Direct Download
A pre-built signed debug APK is readily available in the repository:
* **Path**: `releases/LocalDrop-v1.0-debug.apk`
* **Download**: [Direct Link](https://github.com/Hellnight2005/Veltrix/raw/main/releases/LocalDrop-v1.0-debug.apk)

### Building from Source (Capacitor / Android Studio)
```bash
cd apps/localdrop_web

# Build web distribution
npm run build

# Sync assets with native Android project
npx cap sync android

# Open Android Studio to build APK
npx cap open android
```
In Android Studio:
1. Select **Build** $\rightarrow$ **Build Bundle(s) / APK(s)** $\rightarrow$ **Build APK(s)**.
2. The generated APK will be placed in `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 5. 📊 Benchmarking Engine Throughput

To replicate our throughput benchmarks (73+ MB/s on Gigabit LAN):

```bash
cargo run --release -p localdrop_cli -- bench --size 1024MB --chunk-size 1MB
```
Detailed performance logs and hardware specs are documented in `benchmarks/tcp_baseline.md`.
