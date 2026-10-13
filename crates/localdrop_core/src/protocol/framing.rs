use crate::error::LocalDropError;
use crate::protocol::messages::ProtocolMessage;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

/// Maximum allowed frame size: 16 MiB (16,777,216 bytes)
pub const MAX_FRAME_SIZE: u32 = 16 * 1024 * 1024;

/// Write a typed protocol message into an asynchronous writer with a 4-byte BE length prefix.
pub async fn write_message<W>(writer: &mut W, msg: &ProtocolMessage) -> Result<(), LocalDropError>
where
    W: AsyncWrite + Unpin,
{
    let encoded = postcard::to_allocvec(msg)
        .map_err(|e| LocalDropError::DeserializationFailed(e.to_string()))?;

    let len = encoded.len() as u32;
    if len > MAX_FRAME_SIZE {
        return Err(LocalDropError::FrameTooLarge(len, MAX_FRAME_SIZE));
    }
    if len == 0 {
        return Err(LocalDropError::FrameEmpty);
    }

    // Write length prefix (4 bytes Big-Endian)
    writer
        .write_all(&len.to_be_bytes())
        .await
        .map_err(|_| LocalDropError::ConnectionClosed)?;

    // Write payload
    writer
        .write_all(&encoded)
        .await
        .map_err(|_| LocalDropError::ConnectionClosed)?;

    writer
        .flush()
        .await
        .map_err(|_| LocalDropError::ConnectionClosed)?;

    Ok(())
}

/// Read a typed protocol message from an asynchronous reader with a 4-byte BE length prefix.
pub async fn read_message<R>(reader: &mut R) -> Result<ProtocolMessage, LocalDropError>
where
    R: AsyncRead + Unpin,
{
    let mut len_bytes = [0u8; 4];
    match reader.read_exact(&mut len_bytes).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
            return Err(LocalDropError::ConnectionClosed);
        }
        Err(_) => {
            return Err(LocalDropError::ConnectionClosed);
        }
    }

    let len = u32::from_be_bytes(len_bytes);
    if len > MAX_FRAME_SIZE {
        return Err(LocalDropError::FrameTooLarge(len, MAX_FRAME_SIZE));
    }
    if len == 0 {
        return Err(LocalDropError::FrameEmpty);
    }

    let mut buffer = vec![0u8; len as usize];
    reader
        .read_exact(&mut buffer)
        .await
        .map_err(|_| LocalDropError::FrameUnexpectedEof)?;

    let msg: ProtocolMessage = postcard::from_bytes(&buffer)
        .map_err(|e| LocalDropError::DeserializationFailed(e.to_string()))?;

    Ok(msg)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[tokio::test]
    async fn test_ping_pong_framing_roundtrip() {
        let mut buffer = Vec::new();
        let ping = ProtocolMessage::Ping;

        write_message(&mut buffer, &ping).await.unwrap();

        let mut cursor = Cursor::new(buffer);
        let read_msg = read_message(&mut cursor).await.unwrap();

        assert_eq!(read_msg, ping);
    }

    #[tokio::test]
    async fn test_reject_oversized_frame() {
        let oversized = (MAX_FRAME_SIZE + 100).to_be_bytes();
        let mut cursor = Cursor::new(oversized);

        let res = read_message(&mut cursor).await;
        assert!(matches!(res, Err(LocalDropError::FrameTooLarge(_, _))));
    }

    #[tokio::test]
    async fn test_reject_empty_frame() {
        let empty = 0u32.to_be_bytes();
        let mut cursor = Cursor::new(empty);

        let res = read_message(&mut cursor).await;
        assert!(matches!(res, Err(LocalDropError::FrameEmpty)));
    }
}
