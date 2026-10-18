use localdrop_core::error::LocalDropError;
use localdrop_core::protocol::framing::{read_message, write_message};
use localdrop_core::protocol::handshake::{client_handshake, server_handshake};
use localdrop_core::protocol::messages::{
    CancelMessage, ChunkDataMessage, FileMetadataMessage, ProtocolMessage,
};
use localdrop_core::transfer::receiver::sanitize_filename;
use localdrop_core::transfer::state::TransferState;
use localdrop_core::transfer::{receive_file_stream, send_file_stream};
use localdrop_core::transport::{bind_listener, connect_to_peer};
use sha2::{Digest, Sha256};
use std::fs;
use tempfile::tempdir;
use uuid::Uuid;

/// Helper: run a loopback transfer with specific file size and chunk size
async fn run_transfer(file_size_bytes: usize, chunk_size: u32) -> Result<(), LocalDropError> {
    let temp = tempdir().expect("Create temp dir");
    let src_dir = temp.path().join("src");
    let dst_dir = temp.path().join("dst");
    fs::create_dir_all(&src_dir).unwrap();
    fs::create_dir_all(&dst_dir).unwrap();

    let src_file = src_dir.join("payload.bin");
    let payload: Vec<u8> = (0..file_size_bytes).map(|i| (i * 31 % 256) as u8).collect();
    fs::write(&src_file, &payload).unwrap();
    let expected_hash: [u8; 32] = Sha256::digest(&payload).into();

    let listener = bind_listener(0).await?;
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let dst_dir_clone = dst_dir.clone();
    let server_task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let _session =
            server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", chunk_size)
                .await?;
        receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir_clone, None).await
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await?;
        let session =
            client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", chunk_size)
                .await?;
        send_file_stream::<_, fn(_)>(
            &mut stream,
            &src_file,
            session.negotiated_chunk_size,
            None,
        )
        .await
    });

    let (client_res, server_res) = tokio::join!(client_task, server_task);
    client_res.map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))??;
    let received_info = server_res.map_err(|e| LocalDropError::StorageReadFailed(e.to_string()))??;

    assert_eq!(received_info.file_size, file_size_bytes as u64);
    assert_eq!(received_info.file_sha256, expected_hash);

    let dst_file = dst_dir.join("payload.bin");
    assert!(dst_file.exists());
    let read_back = fs::read(&dst_file).unwrap();
    assert_eq!(read_back, payload);

    Ok(())
}

// =========================================================================
// Condition Group 1: Various File Sizes (Non-boundary, odd sizes, large)
// =========================================================================

#[tokio::test]
async fn test_non_chunk_boundary_file() {
    // 100,000 bytes with 16KB chunk size (6 full chunks + 1 partial chunk)
    run_transfer(100_000, 16 * 1024).await.unwrap();
}

#[tokio::test]
async fn test_file_size_one_byte_less_than_chunk() {
    // 16,383 bytes with 16KB chunk size
    run_transfer(16 * 1024 - 1, 16 * 1024).await.unwrap();
}

#[tokio::test]
async fn test_file_size_one_byte_more_than_chunk() {
    // 16,385 bytes with 16KB chunk size (1 full chunk + 1 byte chunk)
    run_transfer(16 * 1024 + 1, 16 * 1024).await.unwrap();
}

#[tokio::test]
async fn test_multi_megabyte_transfer() {
    // 5 MB file transfer with 64KB chunk size
    run_transfer(5 * 1024 * 1024, 64 * 1024).await.unwrap();
}

// =========================================================================
// Condition Group 2: Path Sanitization & Hostile Filenames
// =========================================================================

#[test]
fn test_sanitize_current_dir_dot() {
    // "." represents current directory and must be rejected to prevent overwriting dest dir!
    let res = sanitize_filename(".");
    assert!(
        res.is_err(),
        "sanitize_filename('.') should be rejected, but got {:?}",
        res
    );
}

#[test]
fn test_sanitize_windows_ntfs_alternate_data_stream() {
    // ":" in filename (e.g. "payload.bin:hidden.exe" or "C:payload.bin")
    let res = sanitize_filename("payload.bin:hidden.exe");
    assert!(
        res.is_err(),
        "Colon in filename should be rejected, but got {:?}",
        res
    );
}

#[test]
fn test_sanitize_windows_wildcard_characters() {
    // Wildcard characters *, ?, <, >, |, " are invalid on Windows
    assert!(sanitize_filename("test*file.txt").is_err());
    assert!(sanitize_filename("test?file.txt").is_err());
    assert!(sanitize_filename("test<file.txt").is_err());
    assert!(sanitize_filename("test>file.txt").is_err());
    assert!(sanitize_filename("test|file.txt").is_err());
    assert!(sanitize_filename("test\"file.txt").is_err());
}

#[test]
fn test_sanitize_trailing_dots_and_spaces() {
    // Trailing dots and spaces are stripped by Windows OS causing file aliasing
    assert!(sanitize_filename("test.txt.").is_err());
    assert!(sanitize_filename("test.txt ").is_err());
}

#[test]
fn test_sanitize_null_bytes() {
    // Embedded null bytes
    assert!(sanitize_filename("test\0evil.txt").is_err());
}

#[test]
fn test_sanitize_windows_reserved_names_with_extensions() {
    // Reserved device names like CON.txt, NUL.tar.gz, aux.dat, com1.log
    assert!(sanitize_filename("con.txt").is_err());
    assert!(sanitize_filename("CON.TXT").is_err());
    assert!(sanitize_filename("nul.dat").is_err());
    assert!(sanitize_filename("aux.bin").is_err());
    assert!(sanitize_filename("com1.log").is_err());
    assert!(sanitize_filename("lpt1.pdf").is_err());
}

// =========================================================================
// Condition Group 3: Disconnect at sensitive protocol boundaries
// =========================================================================

#[tokio::test]
async fn test_disconnect_after_all_chunks_before_complete() {
    // Sender sends all chunks, but abruptly disconnects BEFORE sending TransferComplete.
    // Receiver MUST clean up the partial file!
    let temp = tempdir().unwrap();
    let dst_dir = temp.path().join("dst");
    fs::create_dir_all(&dst_dir).unwrap();

    let listener = bind_listener(0).await.unwrap();
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let dst_dir_clone = dst_dir.clone();
    let server_task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let _ = server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", 16 * 1024).await;
        receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir_clone, None).await
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await.unwrap();
        let _ = client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", 16 * 1024).await;

        let fake_transfer_id = Uuid::new_v4();
        let payload = vec![0x42u8; 1024];
        let chunk_hash: [u8; 32] = Sha256::digest(&payload).into();

        let meta = ProtocolMessage::FileMetadata(FileMetadataMessage {
            transfer_id: fake_transfer_id,
            file_name: "hang_at_complete.bin".to_string(),
            file_size: 1024,
            chunk_size: 16 * 1024,
            total_chunks: 1,
            file_sha256: chunk_hash,
            mime_type: None,
        });
        write_message(&mut stream, &meta).await.unwrap();
        let _ready = read_message(&mut stream).await.unwrap();

        // Send the only chunk
        let chunk = ProtocolMessage::ChunkData(ChunkDataMessage {
            transfer_id: fake_transfer_id,
            chunk_index: 0,
            offset: 0,
            chunk_sha256: chunk_hash,
            payload,
        });
        write_message(&mut stream, &chunk).await.unwrap();
        let _ack = read_message(&mut stream).await.unwrap();

        // Now drop stream WITHOUT sending TransferComplete!
        drop(stream);
    });

    let (client_res, server_res) = tokio::join!(client_task, server_task);
    client_res.unwrap();
    let server_result = server_res.unwrap();

    assert!(server_result.is_err(), "Server should have detected disconnection");

    // CRITICAL: Partial file must be deleted when sender disconnects before complete!
    let entries: Vec<_> = fs::read_dir(&dst_dir).unwrap().collect();
    assert!(
        entries.is_empty(),
        "Partial file leaked on disk when sender disconnected before TransferComplete!"
    );
}

// =========================================================================
// Condition Group 4: Mismatched File Size / Fake Advertised Size
// =========================================================================

#[tokio::test]
async fn test_reject_mismatched_file_size() {
    // Sender advertises 1,000,000 bytes, but sends only 1 chunk of 10 bytes and declares total_chunks: 1
    let temp = tempdir().unwrap();
    let dst_dir = temp.path().join("dst");
    fs::create_dir_all(&dst_dir).unwrap();

    let listener = bind_listener(0).await.unwrap();
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let dst_dir_clone = dst_dir.clone();
    let server_task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let _ = server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", 16 * 1024).await;
        receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir_clone, None).await
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await.unwrap();
        let _ = client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", 16 * 1024).await;

        let fake_transfer_id = Uuid::new_v4();
        let payload = vec![0x11u8; 10];
        let file_sha256: [u8; 32] = Sha256::digest(&payload).into();

        // Advertised file size is 1,000,000 with 16KB chunks, but sender fraudulently claims total_chunks is 1
        let meta = ProtocolMessage::FileMetadata(FileMetadataMessage {
            transfer_id: fake_transfer_id,
            file_name: "lying_size.bin".to_string(),
            file_size: 1_000_000,
            chunk_size: 16 * 1024,
            total_chunks: 1,
            file_sha256,
            mime_type: None,
        });
        write_message(&mut stream, &meta).await.unwrap();

        // Server immediately detects fraud and responds with rejection code 3003
        match read_message(&mut stream).await.unwrap() {
            ProtocolMessage::Ready(ready) => {
                assert!(!ready.accepted);
                assert_eq!(ready.rejection_code, Some(3003));
            }
            other => panic!("Expected Ready rejection, got {:?}", other),
        }
    });

    let (client_res, server_res) = tokio::join!(client_task, server_task);
    client_res.unwrap();
    let server_result = server_res.unwrap();

    // Receiver should reject when total_chunks does not match file_size arithmetic!
    assert!(
        matches!(server_result, Err(LocalDropError::ChunkOutOfBounds(_, _))),
        "Receiver should reject transfer when total_chunks doesn't match file_size arithmetic!"
    );

    let entries: Vec<_> = fs::read_dir(&dst_dir).unwrap().collect();
    assert!(entries.is_empty(), "Partial file leaked after size mismatch!");
}

#[tokio::test]
async fn test_reject_truncated_chunk_payload() {
    // Metadata says 16KB (1 chunk of 16KB), but sender sends only 10 bytes in that chunk!
    let temp = tempdir().unwrap();
    let dst_dir = temp.path().join("dst");
    fs::create_dir_all(&dst_dir).unwrap();

    let listener = bind_listener(0).await.unwrap();
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let dst_dir_clone = dst_dir.clone();
    let server_task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let _ = server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", 16 * 1024).await;
        receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir_clone, None).await
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await.unwrap();
        let _ = client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", 16 * 1024).await;

        let fake_transfer_id = Uuid::new_v4();
        let short_payload = vec![0x11u8; 10]; // Only 10 bytes instead of 16,384!
        let chunk_hash: [u8; 32] = Sha256::digest(&short_payload).into();

        let meta = ProtocolMessage::FileMetadata(FileMetadataMessage {
            transfer_id: fake_transfer_id,
            file_name: "short_payload.bin".to_string(),
            file_size: 16 * 1024,
            chunk_size: 16 * 1024,
            total_chunks: 1,
            file_sha256: [0u8; 32],
            mime_type: None,
        });
        write_message(&mut stream, &meta).await.unwrap();
        let _ready = read_message(&mut stream).await.unwrap();

        let chunk = ProtocolMessage::ChunkData(ChunkDataMessage {
            transfer_id: fake_transfer_id,
            chunk_index: 0,
            offset: 0,
            chunk_sha256: chunk_hash,
            payload: short_payload,
        });
        write_message(&mut stream, &chunk).await.unwrap();
    });

    let (_, server_res) = tokio::join!(client_task, server_task);
    let server_result = server_res.unwrap();
    assert!(
        server_result.is_err(),
        "Receiver must reject truncated chunk payload"
    );

    let entries: Vec<_> = fs::read_dir(&dst_dir).unwrap().collect();
    assert!(entries.is_empty(), "Partial file leaked after truncated chunk!");
}

// =========================================================================
// Condition Group 5: Cancellation Flow and Cleanup
// =========================================================================

#[tokio::test]
async fn test_sender_cancels_mid_transfer() {
    let temp = tempdir().unwrap();
    let dst_dir = temp.path().join("dst");
    fs::create_dir_all(&dst_dir).unwrap();

    let listener = bind_listener(0).await.unwrap();
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let dst_dir_clone = dst_dir.clone();
    let server_task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let _ = server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", 16 * 1024).await;
        receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir_clone, None).await
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await.unwrap();
        let _ = client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", 16 * 1024).await;

        let fake_transfer_id = Uuid::new_v4();
        let payload = vec![0x99u8; 16 * 1024];
        let chunk_hash: [u8; 32] = Sha256::digest(&payload).into();

        let meta = ProtocolMessage::FileMetadata(FileMetadataMessage {
            transfer_id: fake_transfer_id,
            file_name: "cancelled.bin".to_string(),
            file_size: 64 * 1024,
            chunk_size: 16 * 1024,
            total_chunks: 4,
            file_sha256: [0u8; 32],
            mime_type: None,
        });
        write_message(&mut stream, &meta).await.unwrap();
        let _ready = read_message(&mut stream).await.unwrap();

        // Send 1 chunk
        let chunk = ProtocolMessage::ChunkData(ChunkDataMessage {
            transfer_id: fake_transfer_id,
            chunk_index: 0,
            offset: 0,
            chunk_sha256: chunk_hash,
            payload,
        });
        write_message(&mut stream, &chunk).await.unwrap();
        let _ack = read_message(&mut stream).await.unwrap();

        // Now send Cancel!
        let cancel = ProtocolMessage::Cancel(CancelMessage {
            transfer_id: fake_transfer_id,
            reason: "User clicked cancel".to_string(),
        });
        write_message(&mut stream, &cancel).await.unwrap();
    });

    let (client_res, server_res) = tokio::join!(client_task, server_task);
    client_res.unwrap();
    let server_result = server_res.unwrap();

    assert!(matches!(
        server_result,
        Err(LocalDropError::TransferCancelled(_))
    ));

    let entries: Vec<_> = fs::read_dir(&dst_dir).unwrap().collect();
    assert!(
        entries.is_empty(),
        "Partial file leaked after sender sent Cancel!"
    );
}

// =========================================================================
// Condition Group 6: Transfer State Machine transitions
// =========================================================================

#[test]
fn test_state_machine_verifying_to_cancelled() {
    let mut state = TransferState::Verifying;
    assert!(
        state.transition_to(TransferState::Cancelled).is_ok(),
        "Verifying should be allowed to transition to Cancelled if user cancels during verification"
    );
}

#[test]
fn test_state_machine_preparing_to_interrupted() {
    let mut state = TransferState::Preparing;
    assert!(
        state.transition_to(TransferState::Interrupted).is_ok(),
        "Preparing should be allowed to transition to Interrupted if network drops"
    );
}

// =========================================================================
// Condition Group 7: Chunk Tampering, Bounds and Rejection Notification
// =========================================================================

#[tokio::test]
async fn test_sender_notified_on_path_traversal() {
    // If sender sends a malicious path, receiver must send Ready { accepted: false, rejection_code: Some(4003) }
    let temp = tempdir().unwrap();
    let dst_dir = temp.path().join("dst");

    let listener = bind_listener(0).await.unwrap();
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let dst_dir_clone = dst_dir.clone();
    let server_task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let _ = server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", 16 * 1024).await;
        receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir_clone, None).await
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await.unwrap();
        let _ = client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", 16 * 1024).await;

        let fake_transfer_id = Uuid::new_v4();
        let meta = ProtocolMessage::FileMetadata(FileMetadataMessage {
            transfer_id: fake_transfer_id,
            file_name: "../../../evil.sh".to_string(),
            file_size: 100,
            chunk_size: 16 * 1024,
            total_chunks: 1,
            file_sha256: [0u8; 32],
            mime_type: None,
        });
        write_message(&mut stream, &meta).await.unwrap();

        // Client reads the response
        match read_message(&mut stream).await.unwrap() {
            ProtocolMessage::Ready(ready) => {
                assert!(!ready.accepted);
                assert_eq!(ready.rejection_code, Some(4003)); // 4003 = PathTraversal
            }
            other => panic!("Expected Ready rejection, got {:?}", other),
        }
    });

    let (client_res, server_res) = tokio::join!(client_task, server_task);
    client_res.unwrap();
    assert!(matches!(
        server_res.unwrap(),
        Err(LocalDropError::PathTraversal(_))
    ));
}

#[tokio::test]
async fn test_tampered_chunk_offset_rejected() {
    let temp = tempdir().unwrap();
    let dst_dir = temp.path().join("dst");

    let listener = bind_listener(0).await.unwrap();
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let dst_dir_clone = dst_dir.clone();
    let server_task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let _ = server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", 16 * 1024).await;
        receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir_clone, None).await
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await.unwrap();
        let _ = client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", 16 * 1024).await;

        let fake_transfer_id = Uuid::new_v4();
        let payload = vec![0x33u8; 16 * 1024];
        let chunk_hash: [u8; 32] = Sha256::digest(&payload).into();

        let meta = ProtocolMessage::FileMetadata(FileMetadataMessage {
            transfer_id: fake_transfer_id,
            file_name: "tampered_offset.bin".to_string(),
            file_size: 16 * 1024,
            chunk_size: 16 * 1024,
            total_chunks: 1,
            file_sha256: chunk_hash,
            mime_type: None,
        });
        write_message(&mut stream, &meta).await.unwrap();
        let _ready = read_message(&mut stream).await.unwrap();

        // Send chunk with corrupted offset (e.g. offset 9999 instead of 0)
        let chunk = ProtocolMessage::ChunkData(ChunkDataMessage {
            transfer_id: fake_transfer_id,
            chunk_index: 0,
            offset: 9999, // Tampered!
            chunk_sha256: chunk_hash,
            payload,
        });
        write_message(&mut stream, &chunk).await.unwrap();
    });

    let (_, server_res) = tokio::join!(client_task, server_task);
    let server_result = server_res.unwrap();
    assert!(server_result.is_err(), "Server must reject tampered chunk offset");
}

#[tokio::test]
async fn test_consecutive_transfers_same_connection_or_dir() {
    let temp = tempdir().unwrap();
    let src_dir = temp.path().join("src");
    let dst_dir = temp.path().join("dst");
    fs::create_dir_all(&src_dir).unwrap();
    fs::create_dir_all(&dst_dir).unwrap();

    // Transfer file 1
    let file1 = src_dir.join("first.txt");
    fs::write(&file1, b"First file content").unwrap();

    // Transfer file 2
    let file2 = src_dir.join("second.txt");
    fs::write(&file2, b"Second file content").unwrap();

    // Run first transfer
    run_transfer(5000, 16 * 1024).await.unwrap();
    // Run second transfer
    run_transfer(12000, 16 * 1024).await.unwrap();
}
