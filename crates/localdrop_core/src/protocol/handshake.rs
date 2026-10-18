use crate::error::LocalDropError;
use crate::protocol::framing::{read_message, write_message};
use crate::protocol::messages::{
    AcceptMessage, CapabilitiesMessage, HelloAckMessage, HelloMessage, ProtocolMessage,
    RejectMessage,
};
use crate::protocol::version::ProtocolVersion;
use tokio::io::{AsyncRead, AsyncWrite};
use tracing::{debug, info};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct HandshakeSession {
    pub remote_device_id: Uuid,
    pub remote_device_name: String,
    pub remote_platform: String,
    pub session_id: Uuid,
    pub negotiated_chunk_size: u32,
}

/// Perform the client side of the protocol handshake.
pub async fn client_handshake<S>(
    stream: &mut S,
    device_id: Uuid,
    device_name: &str,
    platform: &str,
    preferred_chunk_size: u32,
) -> Result<HandshakeSession, LocalDropError>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    debug!("Initiating client handshake with remote peer");

    // 1. Send HELLO
    let hello = ProtocolMessage::Hello(HelloMessage {
        version: ProtocolVersion::CURRENT,
        device_id,
        device_name: device_name.to_string(),
        platform: platform.to_string(),
        client_nonce: [0u8; 32], // Nonce populated for future crypto session binding
    });
    write_message(stream, &hello).await?;

    // 2. Receive HELLO_ACK or REJECT
    let (remote_id, remote_name, remote_platform, session_id) = match read_message(stream).await? {
        ProtocolMessage::HelloAck(ack) => {
            if !ack.version.is_compatible_with(&ProtocolVersion::CURRENT) {
                return Err(LocalDropError::ProtocolVersionMismatch(
                    ProtocolVersion::CURRENT.major,
                    ack.version.major,
                ));
            }
            (ack.device_id, ack.device_name, ack.platform, ack.session_id)
        }
        ProtocolMessage::Reject(reject) => {
            return Err(match reject.error_code {
                2001 => LocalDropError::ProtocolVersionMismatch(ProtocolVersion::CURRENT.major, 0),
                4001 => LocalDropError::PairingRejected,
                4004 => LocalDropError::RateLimited,
                _ => LocalDropError::UnexpectedMessage(format!(
                    "Handshake rejected (code {}): {}",
                    reject.error_code, reject.reason
                )),
            });
        }
        other => {
            return Err(LocalDropError::UnexpectedMessage(format!("{other:?}")));
        }
    };

    // 3. Send CAPABILITIES
    let caps = ProtocolMessage::Capabilities(CapabilitiesMessage {
        supported_transports: vec![1], // TCP
        max_chunk_size: preferred_chunk_size,
        supports_resume: true,
    });
    write_message(stream, &caps).await?;

    // 4. Receive ACCEPT
    let negotiated_chunk_size = match read_message(stream).await? {
        ProtocolMessage::Accept(accept) => accept.negotiated_chunk_size.max(16 * 1024),
        ProtocolMessage::Reject(reject) => {
            return Err(LocalDropError::UnexpectedMessage(format!(
                "Capabilities rejected: {}",
                reject.reason
            )));
        }
        other => return Err(LocalDropError::UnexpectedMessage(format!("{other:?}"))),
    };

    info!(
        "Client handshake successful with peer '{}' ({}), chunk size {} B",
        remote_name, remote_id, negotiated_chunk_size
    );

    Ok(HandshakeSession {
        remote_device_id: remote_id,
        remote_device_name: remote_name,
        remote_platform,
        session_id,
        negotiated_chunk_size,
    })
}

/// Perform the server (receiver) side of the protocol handshake.
pub async fn server_handshake<S>(
    stream: &mut S,
    device_id: Uuid,
    device_name: &str,
    platform: &str,
    max_chunk_size: u32,
) -> Result<HandshakeSession, LocalDropError>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    debug!("Awaiting HELLO from client peer");

    // 1. Receive HELLO
    let hello = match read_message(stream).await? {
        ProtocolMessage::Hello(h) => h,
        other => return Err(LocalDropError::UnexpectedMessage(format!("{other:?}"))),
    };

    // Version check
    if !hello.version.is_compatible_with(&ProtocolVersion::CURRENT) {
        let reject = ProtocolMessage::Reject(RejectMessage {
            error_code: 2001,
            reason: format!(
                "Version mismatch: supported major {}, got {}",
                ProtocolVersion::CURRENT.major,
                hello.version.major
            ),
        });
        let _ = write_message(stream, &reject).await;
        return Err(LocalDropError::ProtocolVersionMismatch(
            ProtocolVersion::CURRENT.major,
            hello.version.major,
        ));
    }

    let session_id = Uuid::new_v4();

    // 2. Send HELLO_ACK
    let ack = ProtocolMessage::HelloAck(HelloAckMessage {
        version: ProtocolVersion::CURRENT,
        device_id,
        device_name: device_name.to_string(),
        platform: platform.to_string(),
        server_nonce: [0u8; 32],
        session_id,
    });
    write_message(stream, &ack).await?;

    // 3. Receive CAPABILITIES
    let caps = match read_message(stream).await? {
        ProtocolMessage::Capabilities(c) => c,
        other => return Err(LocalDropError::UnexpectedMessage(format!("{other:?}"))),
    };

    let negotiated_chunk_size = caps.max_chunk_size.min(max_chunk_size).max(16 * 1024);

    // 4. Send ACCEPT
    let accept = ProtocolMessage::Accept(AcceptMessage {
        selected_transport: 1, // TCP
        negotiated_chunk_size,
        max_concurrent_streams: 1,
    });
    write_message(stream, &accept).await?;

    info!(
        "Server handshake successful with peer '{}' ({}), chunk size {} B",
        hello.device_name, hello.device_id, negotiated_chunk_size
    );

    Ok(HandshakeSession {
        remote_device_id: hello.device_id,
        remote_device_name: hello.device_name,
        remote_platform: hello.platform,
        session_id,
        negotiated_chunk_size,
    })
}
