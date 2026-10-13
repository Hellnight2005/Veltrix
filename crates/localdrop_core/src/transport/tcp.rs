use crate::error::LocalDropError;
use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tracing::info;

/// Binds a TCP listener on the specified port.
pub async fn bind_listener(port: u16) -> Result<TcpListener, LocalDropError> {
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            LocalDropError::PermissionDenied(format!("Port {port}"))
        } else {
            LocalDropError::NetworkUnreachable
        }
    })?;

    info!("TCP listener bound on {}", listener.local_addr().unwrap());
    Ok(listener)
}

/// Connects to a remote peer via TCP with standard socket options.
pub async fn connect_to_peer(target: &str) -> Result<TcpStream, LocalDropError> {
    let stream = TcpStream::connect(target)
        .await
        .map_err(|_| LocalDropError::ConnectionRefused)?;

    // Disable Nagle's algorithm for low-latency control and chunk streaming
    let _ = stream.set_nodelay(true);

    Ok(stream)
}
