use crate::error::LocalDropError;
use crate::protocol::framing::{read_message, write_message};
use crate::protocol::messages::{
    ChunkAckMessage, ProtocolMessage, ReadyMessage, TransferVerifiedMessage,
};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Instant;
use tokio::fs::{self, OpenOptions};
use tokio::io::{AsyncRead, AsyncSeekExt, AsyncWrite, AsyncWriteExt, SeekFrom};
use tracing::{error, info};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ReceivedFileInfo {
    pub transfer_id: Uuid,
    pub file_name: String,
    pub file_path: PathBuf,
    pub file_size: u64,
    pub file_sha256: [u8; 32],
}

/// Sanitize file name to prevent directory traversal attacks or illegal OS characters.
pub fn sanitize_filename(name: &str) -> Result<String, LocalDropError> {
    let path = Path::new(name);
    // Disallow absolute paths, directory components or traversal tokens
    if path.is_absolute()
        || name.contains("..")
        || name.contains('/')
        || name.contains('\\')
        || name.trim().is_empty()
    {
        return Err(LocalDropError::PathTraversal(name.to_string()));
    }

    // Windows reserved filenames check
    let upper = name.to_ascii_uppercase();
    let stem = upper.split('.').next().unwrap_or(&upper);
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.contains(&stem) {
        return Err(LocalDropError::PathTraversal(name.to_string()));
    }

    Ok(name.to_string())
}

/// Receive a file stream from an active, handshaked connection.
pub async fn receive_file_stream<S, F>(
    stream: &mut S,
    destination_dir: &Path,
    mut progress_callback: Option<F>,
) -> Result<ReceivedFileInfo, LocalDropError>
where
    S: AsyncRead + AsyncWrite + Unpin,
    F: FnMut(u64, u64, f64) + Send,
{
    fs::create_dir_all(destination_dir)
        .await
        .map_err(|e| LocalDropError::PermissionDenied(e.to_string()))?;

    // 1. Await FILE_METADATA
    let meta = match read_message(stream).await? {
        ProtocolMessage::FileMetadata(m) => m,
        other => return Err(LocalDropError::UnexpectedMessage(format!("{other:?}"))),
    };

    let sanitized_name = sanitize_filename(&meta.file_name)?;
    let final_path = destination_dir.join(&sanitized_name);
    let part_path = destination_dir.join(format!("{}.part.{}", sanitized_name, meta.transfer_id));

    // Send READY acceptance
    let ready_msg = ProtocolMessage::Ready(ReadyMessage {
        transfer_id: meta.transfer_id,
        accepted: true,
        missing_chunks: (0..meta.total_chunks).collect(),
        rejection_code: None,
    });
    write_message(stream, &ready_msg).await?;

    info!(
        "Accepted incoming file '{}' ({} bytes, transfer {})",
        sanitized_name, meta.file_size, meta.transfer_id
    );

    // Open partial destination file
    let mut part_file = match OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&part_path)
        .await
    {
        Ok(f) => f,
        Err(e) => {
            let _ = fs::remove_file(&part_path).await;
            return Err(LocalDropError::PermissionDenied(e.to_string()));
        }
    };

    let start_time = Instant::now();
    let mut bytes_received: u64 = 0;
    let mut running_hasher = Sha256::new();

    // Loop to receive chunks
    let mut chunk_count: u64 = 0;
    while chunk_count < meta.total_chunks {
        let chunk_msg = match read_message(stream).await {
            Ok(msg) => msg,
            Err(e) => {
                // Sender disconnected or error; clean up partial file
                let _ = fs::remove_file(&part_path).await;
                return Err(e);
            }
        };

        match chunk_msg {
            ProtocolMessage::ChunkData(chunk) => {
                if chunk.transfer_id != meta.transfer_id {
                    let _ = fs::remove_file(&part_path).await;
                    return Err(LocalDropError::TransferNotFound(
                        chunk.transfer_id.to_string(),
                    ));
                }
                if chunk.chunk_index >= meta.total_chunks {
                    let _ = fs::remove_file(&part_path).await;
                    return Err(LocalDropError::ChunkOutOfBounds(
                        chunk.chunk_index,
                        meta.total_chunks,
                    ));
                }

                // Verify chunk sha256
                let actual_chunk_sha256: [u8; 32] = Sha256::digest(&chunk.payload).into();
                if actual_chunk_sha256 != chunk.chunk_sha256 {
                    let ack = ProtocolMessage::ChunkAck(ChunkAckMessage {
                        transfer_id: meta.transfer_id,
                        chunk_index: chunk.chunk_index,
                        status: 1, // Hash Mismatch
                    });
                    let _ = write_message(stream, &ack).await;
                    let _ = fs::remove_file(&part_path).await;
                    return Err(LocalDropError::ChunkHashMismatch(chunk.chunk_index));
                }

                // Write chunk to disk
                part_file
                    .seek(SeekFrom::Start(chunk.offset))
                    .await
                    .map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))?;

                if !chunk.payload.is_empty() {
                    part_file
                        .write_all(&chunk.payload)
                        .await
                        .map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))?;
                    running_hasher.update(&chunk.payload);
                }

                bytes_received += chunk.payload.len() as u64;

                // Send CHUNK_ACK OK
                let ack = ProtocolMessage::ChunkAck(ChunkAckMessage {
                    transfer_id: meta.transfer_id,
                    chunk_index: chunk.chunk_index,
                    status: 0,
                });
                write_message(stream, &ack).await?;

                chunk_count += 1;

                if let Some(ref mut cb) = progress_callback {
                    let elapsed = start_time.elapsed().as_secs_f64();
                    let speed = if elapsed > 0.0 {
                        bytes_received as f64 / elapsed
                    } else {
                        0.0
                    };
                    cb(bytes_received, meta.file_size, speed);
                }
            }
            ProtocolMessage::Cancel(c) => {
                let _ = fs::remove_file(&part_path).await;
                return Err(LocalDropError::TransferCancelled(c.reason));
            }
            other => {
                let _ = fs::remove_file(&part_path).await;
                return Err(LocalDropError::UnexpectedMessage(format!("{other:?}")));
            }
        }
    }

    // Flush and close file handle
    part_file
        .flush()
        .await
        .map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))?;
    drop(part_file);

    // 4. Await TRANSFER_COMPLETE
    match read_message(stream).await? {
        ProtocolMessage::TransferComplete(comp) => {
            let computed_file_sha256: [u8; 32] = running_hasher.finalize().into();

            if computed_file_sha256 != meta.file_sha256 || comp.final_sha256 != meta.file_sha256 {
                error!(
                    "Integrity check failed for transfer {}: expected {:x?}, calculated {:x?}",
                    meta.transfer_id, meta.file_sha256, computed_file_sha256
                );

                let ver_msg = ProtocolMessage::TransferVerified(TransferVerifiedMessage {
                    transfer_id: meta.transfer_id,
                    success: false,
                    error_code: Some(3001),
                });
                let _ = write_message(stream, &ver_msg).await;

                // Delete partial corrupted file
                let _ = fs::remove_file(&part_path).await;
                return Err(LocalDropError::IntegrityMismatch(
                    hex::encode(meta.file_sha256),
                    hex::encode(computed_file_sha256),
                ));
            }

            // Verification successful: send verified ACK
            let ver_msg = ProtocolMessage::TransferVerified(TransferVerifiedMessage {
                transfer_id: meta.transfer_id,
                success: true,
                error_code: None,
            });
            write_message(stream, &ver_msg).await?;

            // Atomically rename .part file to final destination
            fs::rename(&part_path, &final_path)
                .await
                .map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))?;

            info!(
                "Successfully received and verified '{}' at {:?}",
                sanitized_name, final_path
            );

            Ok(ReceivedFileInfo {
                transfer_id: meta.transfer_id,
                file_name: sanitized_name,
                file_path: final_path,
                file_size: meta.file_size,
                file_sha256: computed_file_sha256,
            })
        }
        other => {
            let _ = fs::remove_file(&part_path).await;
            Err(LocalDropError::UnexpectedMessage(format!("{other:?}")))
        }
    }
}

/// Helper hex formatting for error strings
mod hex {
    pub fn encode(data: [u8; 32]) -> String {
        data.iter().map(|b| format!("{:02x}", b)).collect()
    }
}
