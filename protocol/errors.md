# LocalDrop Protocol — Error Codes Catalog

## 1. Overview

Every error in LocalDrop has a unique 16-bit unsigned integer identifier (`u16`), a standardized string code, and a deterministic failure/retry policy. 

Errors are partitioned into 5 functional subsystems:
* **1000 – 1999:** Framing & Transport
* **2000 – 2999:** Protocol & Handshake
* **3000 – 3999:** Transfer & Data Integrity
* **4000 – 4999:** Security, Pairing & Authentication
* **5000 – 5999:** Storage, Filesystem & Disk I/O

---

## 2. Framing & Transport Errors (1000 – 1999)

| Code | Identifier | Description | Category | Action |
|---|---|---|---|---|
| `1000` | `ERR_CONNECTION_CLOSED` | Peer closed TCP stream cleanly. | Transient | Finalize or mark interrupted. |
| `1001` | `ERR_FRAME_TOO_LARGE` | Declared frame length exceeds `16 MiB`. | Fatal | Close socket immediately, reject data. |
| `1002` | `ERR_FRAME_EMPTY` | Zero-length frame received where payload required. | Fatal | Protocol violation; abort connection. |
| `1003` | `ERR_FRAME_UNEXPECTED_EOF` | Stream ended mid-frame while reading payload. | Retriable | Mark transfer interrupted, enter `RECONNECTING`. |
| `1004` | `ERR_DESERIALIZATION_FAILED`| Postcard binary decoding failed on payload slice. | Fatal | Terminate connection. |
| `1005` | `ERR_SOCKET_TIMEOUT` | No data received within keepalive / read deadline. | Retriable | Attempt reconnect / heartbeat. |
| `1006` | `ERR_CONNECTION_REFUSED` | Target IP/port actively refused connection. | Retriable | Exponential backoff retry. |
| `1007` | `ERR_NETWORK_UNREACHABLE` | No local route to peer (Wi-Fi off / subnet mismatch).| Retriable | Notify user, check network interface. |

---

## 3. Protocol & Handshake Errors (2000 – 2999)

| Code | Identifier | Description | Category | Action |
|---|---|---|---|---|
| `2000` | `ERR_UNEXPECTED_MESSAGE` | Message variant received out of sequence for state. | Fatal | Disconnect peer. |
| `2001` | `ERR_PROTOCOL_VERSION_MISMATCH` | Major protocol versions are incompatible. | Fatal | Clean refusal via `REJECT`, alert user. |
| `2002` | `ERR_HANDSHAKE_TIMEOUT` | Handshake did not complete within 10 seconds. | Retriable | Abort connection. |
| `2003` | `ERR_CAPABILITY_UNSUPPORTED`| Requested transport or compression unsupported. | Fatal | Fallback or abort. |
| `2004` | `ERR_SESSION_INVALID` | Session ID or nonce does not match handshake state. | Fatal | Reject request. |

---

## 4. Transfer & Data Integrity Errors (3000 – 3999)

| Code | Identifier | Description | Category | Action |
|---|---|---|---|---|
| `3000` | `ERR_TRANSFER_NOT_FOUND` | Chunk received for non-existent or cancelled transfer. | Fatal | Ignore or send `CANCEL`. |
| `3001` | `ERR_INTEGRITY_MISMATCH` | Final full-file SHA-256 does not match metadata. | Fatal | Delete partial file, report `FAILED_INTEGRITY`. |
| `3002` | `ERR_CHUNK_HASH_MISMATCH`| Individual chunk SHA-256 validation failed. | Retriable | Request chunk retransmission via `CHUNK_ACK`. |
| `3003` | `ERR_CHUNK_OUT_OF_BOUNDS`| `chunk_index >= total_chunks` in `CHUNK_DATA`. | Fatal | Protocol error; abort transfer. |
| `3004` | `ERR_TRANSFER_CANCELLED` | User or remote peer cancelled transfer deliberately. | User | Delete temporary files, transition to `CANCELLED`. |
| `3005` | `ERR_RESUME_CORRUPT` | Disk resume manifest is malformed or invalid. | Retriable | Purge partial manifest; restart from chunk 0. |

---

## 5. Security & Pairing Errors (4000 – 4999)

| Code | Identifier | Description | Category | Action |
|---|---|---|---|---|
| `4000` | `ERR_UNTRUSTED_DEVICE` | Peer is not paired and user declined one-time accept. | User | Refuse connection cleanly. |
| `4001` | `ERR_PAIRING_REJECTED` | User explicitly clicked Reject on pairing request. | User | Terminate session. |
| `4002` | `ERR_PAIRING_CODE_MISMATCH` | 6-digit confirmation PIN / QR verification failed. | Fatal | Suspect MITM attack; terminate and alert. |
| `4003` | `ERR_PATH_TRAVERSAL` | Filename contains `..`, absolute path, or reserved token. | Fatal | Reject metadata; drop transfer immediately. |
| `4004` | `ERR_RATE_LIMITED` | Too many connection attempts from source IP. | Retriable | Temporary IP throttling. |

---

## 6. Storage & Filesystem Errors (5000 – 5999)

| Code | Identifier | Description | Category | Action |
|---|---|---|---|---|
| `5000` | `ERR_STORAGE_READ_FAILED` | Sender failed reading local source file. | Fatal | Terminate transfer, notify user of file lock. |
| `5001` | `ERR_INSUFFICIENT_SPACE` | Free disk space on receiver is less than file size. | Fatal | Reject in `READY`, prompt user to free storage. |
| `5002` | `ERR_PERMISSION_DENIED` | Receiver cannot write to designated download directory. | User | Prompt user to change download directory. |
| `5003` | `ERR_FILE_LOCKED` | Destination file is locked by another process. | Retriable | Retry or select alternative filename. |
| `5004` | `ERR_SOURCE_FILE_MODIFIED`| File length or timestamp changed during active transfer.| Fatal | Abort transfer; hash will not match. |
