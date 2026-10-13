# Security Policy

## Supported Versions

| Version | Supported |
| :--- | :--- |
| **v1.x (Current)** | :white_check_mark: |
| < v1.0 | :x: |

---

## Reporting a Vulnerability

We take the security of LocalDrop and its peer-to-peer networking architecture seriously. If you discover a security vulnerability, **please do not disclose it publicly via GitHub issues or discussions**.

Instead, please report it privately:
1. **GitHub Security Advisory**: Open a private draft security advisory at [https://github.com/Hellnight2005/Veltrix/security/advisories/new](https://github.com/Hellnight2005/Veltrix/security/advisories/new).
2. **Email**: Contact the maintainers directly via GitHub profile contact information.

Please include:
* A description of the vulnerability and its potential impact.
* Steps or a minimal proof of concept (PoC) to reproduce the vulnerability.
* Affected components (e.g. `crates/localdrop_core`, path sanitizer, framing parser, or mobile web app).

We will acknowledge receipt within **48 hours** and coordinate a fix and disclosure timeline.

---

## Security Architecture Principles

LocalDrop enforces security by design on untrusted local networks:
* **Zero Cloud Relay**: Files, metadata, and video streams never transit third-party servers.
* **Strict Path Sanitization**: Receiving nodes strip all directory separators (`/`, `\`), relative path traversals (`..`), null bytes, and Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
* **Bounded Memory & Framing**: 4-byte big-endian framing strictly bounds payloads to a maximum of 16 MiB per frame, preventing unbounded memory allocation attacks.
* **Pre-Allocation Checks**: File sizes are validated against free disk space before receiving begins to prevent disk exhaustion denial-of-service.
* **Cryptographic Integrity**: Streaming SHA-256 digests verify complete file integrity before renaming temporary files to final user-accessible paths.
