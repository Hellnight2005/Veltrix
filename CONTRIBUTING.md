# Contributing to LocalDrop

Thank you for your interest in contributing to LocalDrop!

## 🛠️ Development Setup

To get started with local development, follow these steps:

### 1. Prerequisites
- **Flutter SDK**: Ensure you have Flutter installed. Run `flutter doctor` to verify.
- **Rust Toolchain**: Install Rust via rustup.
- **Flutter Rust Bridge CLI**: Install the code generator tool:
  ```bash
  cargo install flutter_rust_bridge_codegen
  ```

### 2. Project Directory Organization
- `/apps/localdrop_flutter`: Flutter application and UI.
- `/crates/localdrop_core`: Core Rust networking implementation.

### 3. Running Code Generation
If you modify the Rust bridge interface (located in the Rust crate), regenerate the Dart bindings:
```bash
flutter_rust_bridge_codegen --rust-input crates/localdrop_core/src/api.rs --dart-output apps/localdrop_flutter/lib/src/rust/api.dart
```

## 🧑‍💻 Code Guidelines

- **Rust Core:** Maintain a clean, modular structure. Ensure all unsafe blocks (if any) are fully documented. Avoid calling platform-specific features directly; abstract them.
- **Flutter UI:** Use Riverpod for state management. Separate pure display widgets from providers.
- **Commit Messages:** Follow standard conventional commit formats (`feat: ...`, `fix: ...`, `docs: ...`).
