use localdrop_core::error::LocalDropError;
use localdrop_core::protocol::framing::{read_message, write_message};
use localdrop_core::protocol::handshake::{client_handshake, server_handshake};
use localdrop_core::protocol::messages::{HelloMessage, ProtocolMessage};
use localdrop_core::protocol::version::ProtocolVersion;
use localdrop_core::transfer::{receive_file_stream, send_file_stream};
use localdrop_core::transport::{bind_listener, connect_to_peer};
use sha2::{Digest, Sha256};
use std::fs;
use tempfile::tempdir;
use uuid::Uuid;

async fn run_loopback_transfer(file_size_bytes: usize, chunk_size: u32) {
    let temp = tempdir().expect("Create temp dir");
    let src_dir = temp.path().join("src");
    let dst_dir = temp.path().join("dst");
    fs::create_dir_all(&src_dir).unwrap();
    fs::create_dir_all(&dst_dir).unwrap();

    let src_file = src_dir.join("test_payload.bin");
    let payload: Vec<u8> = (0..file_size_bytes).map(|i| (i % 251) as u8).collect();
    fs::write(&src_file, &payload).unwrap();

    let expected_hash: [u8; 32] = Sha256::digest(&payload).into();

    let listener = bind_listener(0).await.expect("Bind ephemeral listener");
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let server_task = tokio::spawn({
        let dst_dir = dst_dir.clone();
        async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let _session =
                server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", chunk_size)
                    .await
                    .expect("Server handshake");

            receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir, None)
                .await
                .expect("Receive file")
        }
    });

    let client_task = tokio::spawn({
        let src_file = src_file.clone();
        async move {
            let mut stream = connect_to_peer(&server_target)
                .await
                .expect("Connect to server");

            let session =
                client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", chunk_size)
                    .await
                    .expect("Client handshake");

            send_file_stream::<_, fn(_)>(
                &mut stream,
                &src_file,
                session.negotiated_chunk_size,
                None,
            )
            .await
            .expect("Send file")
        }
    });

    let (_, received_info) = tokio::try_join!(client_task, server_task).unwrap();

    assert_eq!(received_info.file_size, file_size_bytes as u64);
    assert_eq!(received_info.file_sha256, expected_hash);

    let dst_file = dst_dir.join("test_payload.bin");
    assert!(dst_file.exists());
    let read_back = fs::read(&dst_file).unwrap();
    assert_eq!(read_back, payload);
}

#[tokio::test]
async fn test_transfer_zero_byte_file() {
    run_loopback_transfer(0, 64 * 1024).await;
}

#[tokio::test]
async fn test_transfer_one_byte_file() {
    run_loopback_transfer(1, 64 * 1024).await;
}

#[tokio::test]
async fn test_transfer_exact_chunk_boundary() {
    run_loopback_transfer(64 * 1024, 64 * 1024).await;
}

#[tokio::test]
async fn test_transfer_one_megabyte_file() {
    run_loopback_transfer(1024 * 1024, 64 * 1024).await;
}

#[tokio::test]
async fn test_corrupt_byte_in_transit_fails_integrity() {
    let temp = tempdir().unwrap();
    let dst_dir = temp.path().join("dst");
    fs::create_dir_all(&dst_dir).unwrap();

    let listener = bind_listener(0).await.unwrap();
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let server_task = tokio::spawn({
        let dst_dir = dst_dir.clone();
        async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let _ =
                server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", 64 * 1024).await;
            receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir, None).await
        }
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await.unwrap();
        let _ = client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", 64 * 1024).await;

        let fake_transfer_id = Uuid::new_v4();
        let meta = ProtocolMessage::FileMetadata(localdrop_core::protocol::FileMetadataMessage {
            transfer_id: fake_transfer_id,
            file_name: "tampered.bin".to_string(),
            file_size: 10,
            chunk_size: 64 * 1024,
            total_chunks: 1,
            file_sha256: [0xAA; 32], // Declared hash
            mime_type: None,
        });
        write_message(&mut stream, &meta).await.unwrap();

        let _ready = read_message(&mut stream).await.unwrap();

        // Send corrupt payload whose hash won't match metadata
        let payload = vec![0xBB; 10];
        let chunk_hash: [u8; 32] = Sha256::digest(&payload).into();
        let chunk = ProtocolMessage::ChunkData(localdrop_core::protocol::ChunkDataMessage {
            transfer_id: fake_transfer_id,
            chunk_index: 0,
            offset: 0,
            chunk_sha256: chunk_hash,
            payload,
        });
        write_message(&mut stream, &chunk).await.unwrap();
        let _ack = read_message(&mut stream).await.unwrap();

        // Complete with hash mismatch
        let complete =
            ProtocolMessage::TransferComplete(localdrop_core::protocol::TransferCompleteMessage {
                transfer_id: fake_transfer_id,
                final_sha256: [0xAA; 32],
            });
        write_message(&mut stream, &complete).await.unwrap();

        let _ver = read_message(&mut stream).await.unwrap();
    });

    let (_, server_res) = tokio::join!(client_task, server_task);
    let server_result = server_res.unwrap();

    // Receiver must report IntegrityMismatch
    assert!(matches!(
        server_result,
        Err(LocalDropError::IntegrityMismatch(_, _))
    ));

    // Partial file must be deleted
    let entries: Vec<_> = fs::read_dir(&dst_dir).unwrap().collect();
    assert!(
        entries.is_empty(),
        "Partial file was not cleaned up on corruption!"
    );
}

#[tokio::test]
async fn test_protocol_version_mismatch_clean_refusal() {
    let listener = bind_listener(0).await.unwrap();
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let server_task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", 64 * 1024).await
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await.unwrap();
        // Send incompatible major version (e.g. 99.0)
        let incompatible_hello = ProtocolMessage::Hello(HelloMessage {
            version: ProtocolVersion::new(99, 0),
            device_id: Uuid::new_v4(),
            device_name: "FutureClient".to_string(),
            platform: "future_os".to_string(),
            client_nonce: [0u8; 32],
        });
        write_message(&mut stream, &incompatible_hello)
            .await
            .unwrap();

        match read_message(&mut stream).await.unwrap() {
            ProtocolMessage::Reject(r) => {
                assert_eq!(r.error_code, 2001);
            }
            other => panic!("Expected Reject, got {:?}", other),
        }
    });

    let (client_res, server_res) = tokio::join!(client_task, server_task);
    client_res.unwrap();
    assert!(matches!(
        server_res.unwrap(),
        Err(LocalDropError::ProtocolVersionMismatch(1, 99))
    ));
}

#[tokio::test]
async fn test_sender_disconnect_mid_transfer_cleans_up() {
    let temp = tempdir().unwrap();
    let dst_dir = temp.path().join("dst");
    fs::create_dir_all(&dst_dir).unwrap();

    let listener = bind_listener(0).await.unwrap();
    let server_target = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());

    let server_task = tokio::spawn({
        let dst_dir = dst_dir.clone();
        async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let _ =
                server_handshake(&mut stream, Uuid::new_v4(), "Server", "test_os", 64 * 1024).await;
            receive_file_stream::<_, fn(u64, u64, f64)>(&mut stream, &dst_dir, None).await
        }
    });

    let client_task = tokio::spawn(async move {
        let mut stream = connect_to_peer(&server_target).await.unwrap();
        let _ = client_handshake(&mut stream, Uuid::new_v4(), "Client", "test_os", 64 * 1024).await;

        let fake_transfer_id = Uuid::new_v4();
        let meta = ProtocolMessage::FileMetadata(localdrop_core::protocol::FileMetadataMessage {
            transfer_id: fake_transfer_id,
            file_name: "aborted.bin".to_string(),
            file_size: 1024 * 1024,
            chunk_size: 64 * 1024,
            total_chunks: 16,
            file_sha256: [0u8; 32],
            mime_type: None,
        });
        write_message(&mut stream, &meta).await.unwrap();
        let _ready = read_message(&mut stream).await.unwrap();

        // Send 1 chunk and abruptly drop connection!
        let chunk = ProtocolMessage::ChunkData(localdrop_core::protocol::ChunkDataMessage {
            transfer_id: fake_transfer_id,
            chunk_index: 0,
            offset: 0,
            chunk_sha256: Sha256::digest([0u8; 64 * 1024]).into(),
            payload: vec![0u8; 64 * 1024],
        });
        write_message(&mut stream, &chunk).await.unwrap();
        let _ack = read_message(&mut stream).await.unwrap();

        // Dropping stream abruptly here
        drop(stream);
    });

    let (client_res, server_res) = tokio::join!(client_task, server_task);
    client_res.unwrap();
    let server_err = server_res.unwrap();
    assert!(
        server_err.is_err(),
        "Server should have caught disconnection"
    );

    // Partial file must be deleted on sender disconnect
    let entries: Vec<_> = fs::read_dir(&dst_dir).unwrap().collect();
    assert!(
        entries.is_empty(),
        "Partial file was not cleaned up on unexpected disconnect!"
    );
}
