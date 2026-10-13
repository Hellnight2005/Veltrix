# LocalDrop Protocol Specification (v1.0)

This directory contains the authoritative technical specifications for the LocalDrop protocol. 

The protocol is designed from first principles according to the engineering tenets in [`ENGINE_PLAN.md`](../ENGINE_PLAN.md):
1. **Engine First**: Sockets and wire formats are defined explicitly and tested thoroughly.
2. **Correctness & Reliability**: Explicit state machines, streaming I/O, deterministic length-prefixed framing, and end-to-end SHA-256 integrity validation.
3. **Zero Cloud Dependency**: Pure peer-to-peer over local area networks (LAN / Wi-Fi / Ethernet).
4. **Transport Agnostic Core**: Baseline over TCP, with an abstraction layer designed for QUIC and UDP evaluation.

---

## Specification Documents

| Document | Description |
|---|---|
| [`framing.md`](./framing.md) | Wire protocol, u32 length prefix, frame bounds, memory limits, and serialization. |
| [`handshake.md`](./handshake.md) | Device introduction, version negotiation, capabilities exchange, and session establishment. |
| [`transfer.md`](./transfer.md) | File metadata exchange, logical chunking, streaming data transfer, state machine transitions, and resume manifest. |
| [`discovery.md`](./discovery.md) | Zero-configuration mDNS browsing/advertising (`_localdrop._tcp`), UDP broadcast fallback, and device registry. |
| [`errors.md`](./errors.md) | Standard error catalog, subsystem classifications, and error handling policies. |

---

## Wire Format Summary

All control messages and logical chunk envelopes are transmitted in binary format over streams (TCP / QUIC) using **Postcard** (compact Serde serialization) preceded by a 4-byte Big-Endian length header:

```text
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Payload Length (u32)                    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                    Serialized Payload (N bytes)               +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

* **Max Frame Size:** `16 MiB` (16,777,216 bytes). Frames exceeding this are rejected immediately with `ERR_FRAME_TOO_LARGE`.
* **Byte Order:** Network Byte Order (Big-Endian) for all numeric headers.
* **Integrity:** Per-chunk SHA-256 for early corruption detection + full-file SHA-256 verification before completion.
