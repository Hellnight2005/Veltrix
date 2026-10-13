use thiserror::Error;

/// Core error types categorized by protocol subsystem.
#[derive(Error, Debug, PartialEq, Eq, Clone)]
pub enum LocalDropError {
    // 1000 - 1999: Framing & Transport
    #[error("Connection closed by peer (code 1000)")]
    ConnectionClosed,

    #[error("Frame length {0} exceeds maximum limit of {1} bytes (code 1001)")]
    FrameTooLarge(u32, u32),

    #[error("Empty frame received where payload required (code 1002)")]
    FrameEmpty,

    #[error("Unexpected EOF while reading frame payload (code 1003)")]
    FrameUnexpectedEof,

    #[error("Deserialization failed: {0} (code 1004)")]
    DeserializationFailed(String),

    #[error("Socket operation timed out (code 1005)")]
    SocketTimeout,

    #[error("Connection refused by peer (code 1006)")]
    ConnectionRefused,

    #[error("Network route unreachable (code 1007)")]
    NetworkUnreachable,

    // 2000 - 2999: Protocol & Handshake
    #[error("Unexpected message: {0} (code 2000)")]
    UnexpectedMessage(String),

    #[error("Protocol version mismatch: local major {0}, remote major {1} (code 2001)")]
    ProtocolVersionMismatch(u16, u16),

    #[error("Handshake timed out (code 2002)")]
    HandshakeTimeout,

    #[error("Unsupported capability: {0} (code 2003)")]
    CapabilityUnsupported(String),

    #[error("Invalid session credentials (code 2004)")]
    SessionInvalid,

    // 3000 - 3999: Transfer & Data Integrity
    #[error("Transfer with ID {0} not found (code 3000)")]
    TransferNotFound(String),

    #[error("File integrity verification failed: expected {0}, calculated {1} (code 3001)")]
    IntegrityMismatch(String, String),

    #[error("Chunk {0} SHA-256 hash mismatch (code 3002)")]
    ChunkHashMismatch(u64),

    #[error("Chunk index {0} out of bounds (total: {1}) (code 3003)")]
    ChunkOutOfBounds(u64, u64),

    #[error("Transfer cancelled: {0} (code 3004)")]
    TransferCancelled(String),

    #[error("Resume manifest is corrupted or invalid: {0} (code 3005)")]
    ResumeCorrupt(String),

    // 4000 - 4999: Security & Pairing
    #[error("Untrusted device {0} (code 4000)")]
    UntrustedDevice(String),

    #[error("Pairing request was rejected (code 4001)")]
    PairingRejected,

    #[error("Pairing security code mismatch (code 4002)")]
    PairingCodeMismatch,

    #[error("Path traversal or illegal file path rejected: '{0}' (code 4003)")]
    PathTraversal(String),

    #[error("Rate limit exceeded (code 4004)")]
    RateLimited,

    // 5000 - 5999: Storage & Local Filesystem
    #[error("Storage read failed: {0} (code 5000)")]
    StorageReadFailed(String),

    #[error(
        "Insufficient disk space: needed {needed} bytes, available {available} bytes (code 5001)"
    )]
    InsufficientSpace { needed: u64, available: u64 },

    #[error("Permission denied accessing filesystem path: '{0}' (code 5002)")]
    PermissionDenied(String),

    #[error("Destination file locked by another process (code 5003)")]
    FileLocked,

    #[error("Source file was modified concurrently during transfer (code 5004)")]
    SourceFileModified,

    // State machine errors
    #[error("Illegal state transition from {from:?} to {to:?}")]
    IllegalStateTransition { from: String, to: String },
}

impl LocalDropError {
    /// Return the standardized 16-bit error code.
    pub fn error_code(&self) -> u16 {
        match self {
            Self::ConnectionClosed => 1000,
            Self::FrameTooLarge(_, _) => 1001,
            Self::FrameEmpty => 1002,
            Self::FrameUnexpectedEof => 1003,
            Self::DeserializationFailed(_) => 1004,
            Self::SocketTimeout => 1005,
            Self::ConnectionRefused => 1006,
            Self::NetworkUnreachable => 1007,

            Self::UnexpectedMessage(_) => 2000,
            Self::ProtocolVersionMismatch(_, _) => 2001,
            Self::HandshakeTimeout => 2002,
            Self::CapabilityUnsupported(_) => 2003,
            Self::SessionInvalid => 2004,

            Self::TransferNotFound(_) => 3000,
            Self::IntegrityMismatch(_, _) => 3001,
            Self::ChunkHashMismatch(_) => 3002,
            Self::ChunkOutOfBounds(_, _) => 3003,
            Self::TransferCancelled(_) => 3004,
            Self::ResumeCorrupt(_) => 3005,

            Self::UntrustedDevice(_) => 4000,
            Self::PairingRejected => 4001,
            Self::PairingCodeMismatch => 4002,
            Self::PathTraversal(_) => 4003,
            Self::RateLimited => 4004,

            Self::StorageReadFailed(_) => 5000,
            Self::InsufficientSpace { .. } => 5001,
            Self::PermissionDenied(_) => 5002,
            Self::FileLocked => 5003,
            Self::SourceFileModified => 5004,

            Self::IllegalStateTransition { .. } => 2999,
        }
    }
}
