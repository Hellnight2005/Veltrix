# LocalDrop Protocol — Framing Specification

## 1. Overview

LocalDrop uses a stream-oriented, length-prefixed framing mechanism. Because TCP provides an unstructured stream of bytes, message boundaries must be explicitly delimited to allow unambiguous decoding, bounded memory consumption, and protection against resource exhaustion attacks.

---

## 2. Frame Structure

Each frame consists of a **4-byte header** followed by a variable-length **payload**:

```text
+-----------------------+------------------------------------------+
|  Length Prefix (u32)  |               Payload Data               |
|      (4 Bytes, BE)    |                (N Bytes)                 |
+-----------------------+------------------------------------------+
```

### 2.1 Header: Length Prefix
* **Type:** 32-bit unsigned integer (`u32`).
* **Byte Order:** Big-Endian (Network Byte Order).
* **Semantics:** Indicates the exact number of bytes ($N$) in the immediately following payload. It does *not* include the 4 bytes of the length prefix itself.

### 2.2 Payload
* **Format:** Binary encoded using [`postcard`](https://crates.io/crates/postcard) (or [`bincode`](https://crates.io/crates/bincode)).
* **Structure:** Encodes a top-level typed message enum (see [`messages.rs`](../crates/localdrop_core/src/protocol/messages.rs) and [`handshake.md`](./handshake.md), [`transfer.md`](./transfer.md)).

---

## 3. Frame Constraints & Resource Limits

To safeguard against memory exhaustion (Denial-of-Service via unbounded allocations):

| Parameter | Value | Rationale |
|---|---|---|
| **Minimum Frame Length** | `1 byte` | Zero-length frames are invalid keep-alives; keep-alives are handled via protocol `PING` frames. |
| **Default Control Frame Max** | `64 KiB` (65,536 B) | Handshake, metadata, and control messages rarely exceed a few kilobytes. |
| **Maximum Absolute Frame Size** | `16 MiB` (16,777,216 B) | Upper bound accommodating maximum application chunk size plus envelope overhead. |
| **Default Chunk Size** | `1 MiB` (1,048,576 B) | Optimal baseline for local TCP sockets without excessive context switching. |

### 3.1 Enforcement Rule
When reading from a network stream:
1. The receiver reads exactly 4 bytes to parse the length prefix `len`.
2. If `len > MAX_FRAME_SIZE` (16 MiB) or `len == 0`:
   * Emit error `ERR_FRAME_TOO_LARGE` (`1001`) or `ERR_FRAME_EMPTY` (`1002`).
   * Immediately terminate the socket connection.
   * **Never** allocate a buffer of size `len` before validating the upper bound.
3. If `len <= MAX_FRAME_SIZE`:
   * Pre-allocate a buffer of size `len`.
   * Read into the buffer until all `len` bytes have been received.
   * Pass the slice to the deserializer.

---

## 4. Message Envelope Serialization

LocalDrop messages are tagged union types serialized using `postcard`. The enum discriminator identifies the variant:

```rust
#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub enum ProtocolMessage {
    Hello(HelloMessage),
    HelloAck(HelloAckMessage),
    Capabilities(CapabilitiesMessage),
    Accept(AcceptMessage),
    Reject(RejectMessage),
    FileMetadata(FileMetadataMessage),
    Ready(ReadyMessage),
    ChunkRequest(ChunkRequestMessage),
    ChunkData(ChunkDataMessage),
    ChunkAck(ChunkAckMessage),
    TransferComplete(TransferCompleteMessage),
    TransferVerified(TransferVerifiedMessage),
    Cancel(CancelMessage),
    Ping,
    Pong,
}
```

* Serialization is zero-copy where feasible.
* Message fields use fixed-width integer types (`u8`, `u16`, `u32`, `u64`).

---

## 5. Streaming Data Transfer Framing

For large files, loading entire files into memory is strictly prohibited:
1. Files are sliced into logical chunks (default 1 MiB).
2. Each chunk is encapsulated inside a `ChunkDataMessage`:
   * `transfer_id`: UUID (16 bytes)
   * `chunk_index`: 64-bit index (`u64`)
   * `chunk_sha256`: 32-byte hash (`[u8; 32]`)
   * `data`: Byte vector (`Vec<u8>`)
3. The sender streams chunks sequentially or based on explicit windowing.
4. Total memory overhead per active transfer is strictly bounded to `O(chunk_size * concurrency_window)`.

---

## 6. Error Handling during Framing

| Condition | Action | Error Code |
|---|---|---|
| Stream EOF before reading 4-byte prefix | Close connection cleanly | `ERR_CONNECTION_CLOSED` (1000) |
| Stream EOF during payload read | Discard partial frame, close connection | `ERR_FRAME_UNEXPECTED_EOF` (1003) |
| Frame length > 16 MiB | Abort immediately, do not allocate | `ERR_FRAME_TOO_LARGE` (1001) |
| Deserialization failure (corrupt postcard payload) | Abort transfer, emit error | `ERR_DESERIALIZATION_FAILED` (1004) |
