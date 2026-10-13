# LocalDrop Protocol — Transfer Specification & State Machine

## 1. Overview

The Transfer subsystem governs how files are prepared, transmitted, validated, and resumed over local network channels. Its core principles are:
* **Zero in-memory whole-file buffering:** Memory consumption must be $O(\text{chunk\_size})$ regardless of whether the file is 1 MB or 20 GB.
* **Deterministic Application-Level Chunking:** Logical chunks are addressed by index with independent SHA-256 checksums.
* **Resumability from Byte Zero to EOF:** Interrupted transfers persist a bitmap manifest so only missing chunks are requested upon reconnection.
* **Strict State Machine Validation:** All transitions between transfer phases are validated to prevent out-of-order execution or zombie connections.

---

## 2. Transfer Flow Diagram

```text
       SENDER (Source)                              RECEIVER (Sink)
              |                                             |
              |==== [Handshake Completed / Session Active] =|
              |                                             |
              |--- FILE_METADATA (id, name, size, hash) --->|
              |                                             | [Inspects disk space & path safety]
              |                                             | [Checks resume manifest on disk]
              |<-- READY (id, accepted, missing_chunks) ----|
              |                                             |
      [For each missing chunk:]                             |
              |--- CHUNK_DATA (index, data, sha256) ------->|
              |                                             | [Verifies chunk SHA-256]
              |                                             | [Writes chunk at offset]
              |<-- CHUNK_ACK (index, status) ---------------| [Updates resume manifest]
              |                                             |
      [All chunks transferred:]                             |
              |--- TRANSFER_COMPLETE (id, final_sha256) --->|
              |                                             | [Computes full-file SHA-256]
              |<-- TRANSFER_VERIFIED (id, success: true) ---| [Deletes resume manifest]
              |                                             |
       [COMPLETED]                                   [COMPLETED]
```

---

## 3. Message Definitions

### 3.1 `FILE_METADATA` (Sender -> Receiver)

Announces an upcoming file transmission.

| Field | Type | Description |
|---|---|---|
| `transfer_id` | `[u8; 16]` | UUID v4 identifying this specific transfer attempt. |
| `file_name` | `String` | Relative filename without path traversal segments (e.g. `"archive.zip"`). |
| `file_size` | `u64` | Total size of the file in bytes. |
| `chunk_size` | `u32` | Negotiated chunk size in bytes (typically `1,048,576` = 1 MiB). |
| `total_chunks` | `u64` | Total number of chunks: $\lceil \text{file\_size} / \text{chunk\_size} \rceil$. |
| `file_sha256` | `[u8; 32]` | SHA-256 digest of the complete original file. |
| `mime_type` | `Option<String>` | Optional MIME type descriptor. |

### 3.2 `READY` (Receiver -> Sender)

Receiver's response to `FILE_METADATA`.

| Field | Type | Description |
|---|---|---|
| `transfer_id` | `[u8; 16]` | Matches `FILE_METADATA.transfer_id`. |
| `accepted` | `bool` | True if receiver accepts the file and has sufficient disk space. |
| `missing_chunks` | `Vec<u64>` | Indices of chunks needed. If fresh transfer: all `0..total_chunks`. If resuming: only unwritten chunks. |
| `rejection_code` | `Option<u16>` | Error code if `accepted == false` (e.g. `5001` Insufficient Space). |

### 3.3 `CHUNK_DATA` (Sender -> Receiver)

Carries a single discrete chunk payload.

| Field | Type | Description |
|---|---|---|
| `transfer_id` | `[u8; 16]` | Transfer identifier. |
| `chunk_index` | `u64` | Zero-based index of this chunk ($0 \le \text{index} < \text{total\_chunks}$). |
| `offset` | `u64` | Byte offset in target file: $\text{chunk\_index} \times \text{chunk\_size}$. |
| `chunk_sha256` | `[u8; 32]` | SHA-256 digest of `payload`. |
| `payload` | `Vec<u8>` | Raw byte slice ($1 \le \text{len} \le \text{chunk\_size}$). |

### 3.4 `CHUNK_ACK` (Receiver -> Sender)

Confirms verification and disk write of a chunk.

| Field | Type | Description |
|---|---|---|
| `transfer_id` | `[u8; 16]` | Transfer identifier. |
| `chunk_index` | `u64` | Index of chunk acknowledged. |
| `status` | `u8` | Status: `0` = Success, `1` = Integrity Mismatch, `2` = Disk Write Error. |

### 3.5 `TRANSFER_COMPLETE` (Sender -> Receiver)

Signal that sender has transmitted all requested chunks.

| Field | Type | Description |
|---|---|---|
| `transfer_id` | `[u8; 16]` | Transfer identifier. |
| `final_sha256` | `[u8; 32]` | Final full-file digest for end-to-end confirmation. |

### 3.6 `TRANSFER_VERIFIED` (Receiver -> Sender)

Final verdict after receiver finishes full file verification.

| Field | Type | Description |
|---|---|---|
| `transfer_id` | `[u8; 16]` | Transfer identifier. |
| `success` | `bool` | `true` if full file hash matches `FILE_METADATA.file_sha256`. |
| `error_code` | `Option<u16>` | Present if `success == false` (e.g. `3001` Integrity Failure). |

### 3.7 `CANCEL` (Bidirectional)

Explicit abort from either peer.

| Field | Type | Description |
|---|---|---|
| `transfer_id` | `[u8; 16]` | Transfer identifier. |
| `reason` | `String` | Descriptive reason (e.g. `"User cancelled transfer"`). |

---

## 4. Transfer State Machine

The transfer engine is modelled as a formal, deterministic finite state machine.

### 4.1 States

```text
               +-----------+
               |  QUEUED   |
               +-----+-----+
                     |
                     v
             +-------+-------+
             |  CONNECTING   |
             +-------+-------+
                     |
                     v
            +--------+-------+
            | AUTHENTICATING |
            +--------+-------+
                     |
                     v
             +-------+-------+
             |   PREPARING   |<========================+
             +-------+-------+                         |
                     |                                 |
                     v                                 |
            +--------+-------+                         |
   +------->|  TRANSFERRING  |                         |
   |        +----+---+---+---+                         |
   |             |   |   |                             |
   | [Disconnect]|   |   | [Complete]                  |
   |             |   |   +--------------+              |
   |             v   v                  |              |
   |    +------------+--+       +-------+-------+      |
   |    |  INTERRUPTED  |       |   VERIFYING   |      |
   |    +--------+------+       +-------+-------+      |
   |             |                      |              |
   |             v                      v              |
   |    +--------+------+       +-------+-------+      |
   |    |  RECONNECTING |       |   COMPLETED   |      |
   |    +--------+------+       +---------------+      |
   |             |                                     |
   |             v                                     |
   |    +--------+------+                              |
   |    |   RESUMING    |------------------------------+
   |    +---------------+
   |
   +--- [Retry / Next Chunk]
```

### 4.2 State Transition Matrix

| Current State | Allowed Next State(s) | Trigger / Condition |
|---|---|---|
| `Queued` | `Connecting`, `Cancelled` | Engine schedules transfer; user cancels before connection. |
| `Connecting` | `Authenticating`, `Interrupted`, `Failed`, `Cancelled` | Socket established; connection refused/timeout. |
| `Authenticating` | `Preparing`, `Failed`, `Cancelled` | Handshake & pairing succeeds; pairing rejected. |
| `Preparing` | `Transferring`, `Failed`, `Cancelled` | Metadata accepted, disk pre-allocated. |
| `Transferring` | `Verifying`, `Interrupted`, `Cancelled`, `Failed` | All chunks sent/received; socket drops; user cancels; disk full. |
| `Interrupted` | `Reconnecting`, `Cancelled`, `Failed` | Auto-reconnect triggered; timeout expired. |
| `Reconnecting` | `Resuming`, `Retrying`, `Failed`, `Cancelled` | Reconnection succeeds; retry backoff. |
| `Resuming` | `Preparing`, `Transferring`, `Failed` | Manifest exchanged, missing chunks computed. |
| `Verifying` | `Completed`, `Failed` | Final SHA-256 matches; hash mismatch (`ERR_INTEGRITY_MISMATCH`). |
| `Completed` | *(Terminal)* | Manifest deleted, file unlocked, event emitted. |
| `Cancelled` | *(Terminal)* | Partial files cleaned up (unless resume kept), event emitted. |
| `Failed` | `Retrying`, *(Terminal)* | Fatal error or max retry limit reached. |

---

## 5. Resume Manifest Specification

To survive unexpected process kills, crashes, and network drops, the receiver maintains a manifest file on disk alongside the partial file:

* **Partial File Path:** `<download_dir>/<file_name>.part.<transfer_id>`
* **Manifest Path:** `<download_dir>/<file_name>.part.<transfer_id>.manifest`

### 5.1 Manifest Binary Header

```text
Offset  Size  Description
0x00    8     Magic Header: b"LDROPRES"
0x08    2     Manifest Version: u16 (1)
0x0A    16    Transfer UUID: [u8; 16]
0x1A    8     Expected File Size: u64
0x22    32    Expected Final SHA-256: [u8; 32]
0x42    4     Chunk Size: u32
0x46    8     Total Chunks: u64
0x4E    M     Bitset (ceil(total_chunks / 8) bytes) where bit[i] == 1 indicates verified chunk.
```

When a resumed connection arrives:
1. Receiver opens the manifest and validates magic, file size, and chunk size.
2. If corrupt or truncated, receiver safely deletes partial files and requests a clean transfer from chunk 0.
3. If valid, receiver reads the bitset, identifies zero bits (missing chunks), and passes them in `READY.missing_chunks`.
