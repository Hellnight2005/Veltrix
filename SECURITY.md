# Security Policy

## Reporting a Vulnerability

If you discover any security-related issues or vulnerabilities within LocalDrop, please do not report them via public GitHub issues. Instead, send an email directly to the project maintainers.

## Security Architecture Overview

LocalDrop enforces security by design on local networks:
- **Device Authentication:** Only paired devices are allowed to initiate file transfers.
- **Data Encryption:** All file data sent over local networks is encrypted.
- **Input Validation:** Strictest path sanitization is applied on the receiving end to prevent directory traversal attacks (e.g., rejecting paths with relative navigation or writing outside target downloads directories).
- **Size Validation:** Incoming file sizes are verified against system limits and disk space before allocation.
