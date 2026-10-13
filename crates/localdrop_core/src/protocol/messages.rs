use crate::protocol::version::ProtocolVersion;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Top-level protocol message enum.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ProtocolMessage {
    // Handshake
    Hello(HelloMessage),
    HelloAck(HelloAckMessage),
    Capabilities(CapabilitiesMessage),
    Accept(AcceptMessage),
    Reject(RejectMessage),

    // Transfer
    FileMetadata(FileMetadataMessage),
    Ready(ReadyMessage),
    ChunkData(ChunkDataMessage),
    ChunkAck(ChunkAckMessage),
    TransferComplete(TransferCompleteMessage),
    TransferVerified(TransferVerifiedMessage),
    Cancel(CancelMessage),

    // Liveness
    Ping,
    Pong,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HelloMessage {
    pub version: ProtocolVersion,
    pub device_id: Uuid,
    pub device_name: String,
    pub platform: String,
    pub client_nonce: [u8; 32],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HelloAckMessage {
    pub version: ProtocolVersion,
    pub device_id: Uuid,
    pub device_name: String,
    pub platform: String,
    pub server_nonce: [u8; 32],
    pub session_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapabilitiesMessage {
    pub supported_transports: Vec<u8>,
    pub max_chunk_size: u32,
    pub supports_resume: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AcceptMessage {
    pub selected_transport: u8,
    pub negotiated_chunk_size: u32,
    pub max_concurrent_streams: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RejectMessage {
    pub error_code: u16,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileMetadataMessage {
    pub transfer_id: Uuid,
    pub file_name: String,
    pub file_size: u64,
    pub chunk_size: u32,
    pub total_chunks: u64,
    pub file_sha256: [u8; 32],
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReadyMessage {
    pub transfer_id: Uuid,
    pub accepted: bool,
    pub missing_chunks: Vec<u64>,
    pub rejection_code: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChunkDataMessage {
    pub transfer_id: Uuid,
    pub chunk_index: u64,
    pub offset: u64,
    pub chunk_sha256: [u8; 32],
    pub payload: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChunkAckMessage {
    pub transfer_id: Uuid,
    pub chunk_index: u64,
    pub status: u8, // 0 = Success, 1 = Hash Mismatch, 2 = Write Error
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransferCompleteMessage {
    pub transfer_id: Uuid,
    pub final_sha256: [u8; 32],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransferVerifiedMessage {
    pub transfer_id: Uuid,
    pub success: bool,
    pub error_code: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CancelMessage {
    pub transfer_id: Uuid,
    pub reason: String,
}
