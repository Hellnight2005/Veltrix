# LocalDrop Protocol — Handshake & Negotiation Specification

## 1. Overview

Before any file transfer can take place, connecting peers must perform a bidirectional handshake to:
1. Verify protocol compatibility and capability sets.
2. Authenticate device identities.
3. Establish session parameters (e.g., maximum supported chunk size, cipher suites).
4. Prevent connection hangs and replay attacks.

---

## 2. Handshake State Diagram

```text
       SENDER (Client)                              RECEIVER (Server)
              |                                             |
              |============== [TCP Connect] ===============>|
              |                                             |
              |--- HELLO (protocol_ver, device_id, ...) --->|
              |                                             |
              |<-- HELLO_ACK (server_ver, session_id, ...) -|
              |                                             |
              |--- CAPABILITIES (transports, chunk_size) -->|
              |                                             |
              |<-- ACCEPT (agreed_params) ------------------|
              |     [or REJECT (error_code, reason)]        |
              |                                             |
     [Handshake Complete]                          [Handshake Complete]
```

---

## 3. Message Definitions

### 3.1 `HELLO` (Sender -> Receiver)

Initiates the session.

| Field | Type | Description |
|---|---|---|
| `protocol_version_major` | `u16` | Major protocol version (currently `1`). |
| `protocol_version_minor` | `u16` | Minor protocol version (currently `0`). |
| `device_id` | `[u8; 16]` | Persistent UUID of the connecting sender. |
| `device_name` | `String` | Human-readable name (e.g., "Abhijeet-Laptop", max 64 UTF-8 bytes). |
| `platform` | `String` | Client OS (`"windows"`, `"android"`, `"linux"`, `"macos"`, `"ios"`). |
| `client_nonce` | `[u8; 32]` | Cryptographically secure random 32-byte nonce. |

### 3.2 `HELLO_ACK` (Receiver -> Sender)

Acknowledges introduction and responds with receiver parameters.

| Field | Type | Description |
|---|---|---|
| `protocol_version_major` | `u16` | Major protocol version of receiver. |
| `protocol_version_minor` | `u16` | Minor protocol version of receiver. |
| `device_id` | `[u8; 16]` | Persistent UUID of receiver. |
| `device_name` | `String` | Human-readable name of receiver (max 64 UTF-8 bytes). |
| `platform` | `String` | Receiver OS. |
| `server_nonce` | `[u8; 32]` | Receiver 32-byte random nonce. |
| `session_id` | `[u8; 16]` | Unique UUID identifying this session. |

### 3.3 `CAPABILITIES` (Sender -> Receiver)

Declares optional extensions and operational bounds supported by the sender.

| Field | Type | Description |
|---|---|---|
| `supported_transports` | `Vec<u8>` | Bitfield or IDs of transports (`0x01` = TCP, `0x02` = QUIC, `0x03` = UDP). |
| `max_chunk_size` | `u32` | Maximum chunk size the sender is prepared to dispatch (default: `1,048,576` = 1 MiB). |
| `compression` | `Vec<u8>` | Supported compression algorithms (`0x00` = None, `0x01` = Zstd). |
| `supports_resume` | `bool` | True if sender supports chunked resume. |

### 3.4 `ACCEPT` (Receiver -> Sender)

Confirms session configuration and authorizes transfer requests.

| Field | Type | Description |
|---|---|---|
| `selected_transport` | `u8` | Transport chosen for session (e.g., `0x01` for TCP). |
| `negotiated_chunk_size` | `u32` | Min of sender and receiver max chunk sizes. |
| `compression` | `u8` | Selected compression algorithm (`0x00` for baseline). |
| `max_concurrent_streams` | `u16` | Maximum parallel chunk streams permitted. |

### 3.5 `REJECT` (Receiver -> Sender)

Sent if handshake conditions are unmet.

| Field | Type | Description |
|---|---|---|
| `error_code` | `u16` | Machine-readable error code (e.g. `2001` for Version Mismatch). |
| `reason` | `String` | Human-readable explanation. |

---

## 4. Version Negotiation Rules

1. **Major Version Match Requirement**:
   * If `sender.protocol_version_major != receiver.protocol_version_major`, the receiver **must** respond with `REJECT` (`ERR_PROTOCOL_VERSION_MISMATCH` = 2001) and terminate the connection.
2. **Minor Version Compatibility**:
   * Backward-compatible additions only increment the minor version.
   * If `sender.protocol_version_minor > receiver.protocol_version_minor`, the sender operates using the subset of capabilities supported by `receiver.protocol_version_minor`.

---

## 5. Security & Timeouts

* **Handshake Timeout:** Receiver and Sender must complete the handshake within **10 seconds** of socket connection, or abort with `ERR_HANDSHAKE_TIMEOUT` (2002).
* **Nonces:** `client_nonce` and `server_nonce` are used in Phase E4 for key derivation and mutual TLS/Noise session binding.
