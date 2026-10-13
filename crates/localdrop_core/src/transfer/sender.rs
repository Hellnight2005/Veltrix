use crate::error::LocalDropError;
use crate::protocol::framing::{read_message, write_message};
use crate::protocol::messages::{
    ChunkDataMessage, FileMetadataMessage, ProtocolMessage, TransferCompleteMessage,
};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::Instant;
use tokio::fs::File;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite};
use tracing::{debug, info};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct TransferProgress {
    pub transfer_id: Uuid,
    pub bytes_sent: u64,
    pub total_bytes: u64,
    pub chunk_index: u64,
    pub total_chunks: u64,
    pub speed_bytes_per_sec: f64,
}

/// Send a file across an active, handshaked stream.
///
/// Ensures bounded O(chunk_size) memory usage by streaming chunk-by-chunk.
/// Computes SHA-256 hashes on the fly and invokes optional progress reporting.
pub async fn send_file_stream<S, F>(
    stream: &mut S,
    file_path: &Path,
    chunk_size: u32,
    mut progress_callback: Option<F>,
) -> Result<Uuid, LocalDropError>
where
    S: AsyncRead + AsyncWrite + Unpin,
    F: FnMut(TransferProgress) + Send,
{
    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| LocalDropError::StorageReadFailed("Invalid file name".to_string()))?
        .to_string();

    let mut file = File::open(file_path)
        .await
        .map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))?;

    let metadata = file
        .metadata()
        .await
        .map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))?;

    let file_size = metadata.len();
    let transfer_id = Uuid::new_v4();

    let chunk_size = chunk_size.max(16 * 1024); // Minimum 16 KB chunk size
    let total_chunks = if file_size == 0 {
        1 // 0-byte file still transmits 1 empty chunk
    } else {
        file_size.div_ceil(chunk_size as u64)
    };

    // Pre-calculate whole-file SHA-256 for metadata advertisement
    // Using streaming reader so memory is bounded
    let mut file_hasher = Sha256::new();
    let mut buffer = vec![0u8; chunk_size as usize];
    loop {
        let bytes_read = file
            .read(&mut buffer)
            .await
            .map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))?;
        if bytes_read == 0 {
            break;
        }
        file_hasher.update(&buffer[..bytes_read]);
    }
    let file_sha256: [u8; 32] = file_hasher.finalize().into();

    // Reset file position back to beginning
    file = File::open(file_path)
        .await
        .map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))?;

    // 1. Send FILE_METADATA
    let meta_msg = ProtocolMessage::FileMetadata(FileMetadataMessage {
        transfer_id,
        file_name,
        file_size,
        chunk_size,
        total_chunks,
        file_sha256,
        mime_type: None,
    });
    write_message(stream, &meta_msg).await?;

    // 2. Await READY
    match read_message(stream).await? {
        ProtocolMessage::Ready(ready) => {
            if !ready.accepted {
                return Err(LocalDropError::TransferCancelled(
                    ready
                        .rejection_code
                        .map(|c| format!("Rejected by receiver with code {c}"))
                        .unwrap_or_else(|| "Rejected by receiver".to_string()),
                ));
            }
        }
        other => return Err(LocalDropError::UnexpectedMessage(format!("{other:?}"))),
    }

    info!(
        "Receiver accepted transfer {} ({} bytes, {} chunks)",
        transfer_id, file_size, total_chunks
    );

    // 3. Stream chunks
    let start_time = Instant::now();
    let mut bytes_sent: u64 = 0;

    for chunk_index in 0..total_chunks {
        let bytes_to_read = if file_size == 0 {
            0
        } else {
            (file_size - bytes_sent).min(chunk_size as u64) as usize
        };

        let mut payload = vec![0u8; bytes_to_read];
        if bytes_to_read > 0 {
            file.read_exact(&mut payload)
                .await
                .map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))?;
        }

        let chunk_sha256: [u8; 32] = Sha256::digest(&payload).into();

        let chunk_msg = ProtocolMessage::ChunkData(ChunkDataMessage {
            transfer_id,
            chunk_index,
            offset: bytes_sent,
            chunk_sha256,
            payload,
        });

        write_message(stream, &chunk_msg).await?;

        // Await CHUNK_ACK
        match read_message(stream).await? {
            ProtocolMessage::ChunkAck(ack) => {
                if ack.chunk_index != chunk_index {
                    return Err(LocalDropError::UnexpectedMessage(format!(
                        "Ack chunk index mismatch: expected {}, got {}",
                        chunk_index, ack.chunk_index
                    )));
                }
                if ack.status != 0 {
                    return Err(LocalDropError::ChunkHashMismatch(chunk_index));
                }
            }
            ProtocolMessage::Cancel(c) => {
                return Err(LocalDropError::TransferCancelled(c.reason));
            }
            other => return Err(LocalDropError::UnexpectedMessage(format!("{other:?}"))),
        }

        bytes_sent += bytes_to_read as u64;

        if let Some(ref mut cb) = progress_callback {
            let elapsed = start_time.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 {
                bytes_sent as f64 / elapsed
            } else {
                0.0
            };
            cb(TransferProgress {
                transfer_id,
                bytes_sent,
                total_bytes: file_size,
                chunk_index,
                total_chunks,
                speed_bytes_per_sec: speed,
            });
        }
    }

    // 4. Send TRANSFER_COMPLETE
    let complete_msg = ProtocolMessage::TransferComplete(TransferCompleteMessage {
        transfer_id,
        final_sha256: file_sha256,
    });
    write_message(stream, &complete_msg).await?;

    // 5. Await TRANSFER_VERIFIED
    match read_message(stream).await? {
        ProtocolMessage::TransferVerified(verified) => {
            if !verified.success {
                return Err(LocalDropError::IntegrityMismatch(
                    "Remote validation failed".to_string(),
                    "".to_string(),
                ));
            }
        }
        other => return Err(LocalDropError::UnexpectedMessage(format!("{other:?}"))),
    }

    debug!("Transfer {} verified and completed", transfer_id);
    Ok(transfer_id)
}
