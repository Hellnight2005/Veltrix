use clap::{Parser, Subcommand};
use indicatif::{ProgressBar, ProgressStyle};
use localdrop_core::protocol::{client_handshake, server_handshake};
use localdrop_core::transfer::{receive_file_stream, send_file_stream, TransferProgress};
use localdrop_core::transport::{bind_listener, connect_to_peer};
use std::path::PathBuf;
use tracing::info;
use uuid::Uuid;

#[derive(Parser)]
#[command(name = "localdrop")]
#[command(about = "Privacy-first peer-to-peer local file transfer", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Receive incoming files from a peer
    Receive {
        #[arg(short, long, default_value_t = 8080)]
        port: u16,

        #[arg(short, long, default_value = "./inbox")]
        out: PathBuf,
    },
    /// Send a file to a remote peer (IP:PORT)
    Send {
        #[arg(help = "Destination peer address (e.g. 127.0.0.1:8080)")]
        target: String,

        #[arg(help = "Path to file to transmit")]
        file: PathBuf,
    },
    /// Discover nearby peers on the local network
    Devices,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let cli = Cli::parse();
    let my_id = Uuid::new_v4();
    let my_name = format!("LocalDrop-{}", &my_id.to_string()[..6]);

    match cli.command {
        Commands::Receive { port, out } => {
            println!("🚀 LocalDrop receiver starting on port {}...", port);
            println!("📂 Inbox destination: {:?}", out);

            let listener = bind_listener(port).await?;
            let (mut stream, peer_addr) = listener.accept().await?;
            println!("🤝 Incoming connection from {}", peer_addr);

            let session = server_handshake(
                &mut stream,
                my_id,
                &my_name,
                std::env::consts::OS,
                1024 * 1024,
            )
            .await?;

            println!(
                "Connected to peer '{}' ({})",
                session.remote_device_name, session.remote_device_id
            );

            let pb = ProgressBar::new(100);
            pb.set_style(
                ProgressStyle::default_bar()
                    .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {bytes}/{total_bytes} ({eta})")
                    .expect("Valid template")
                    .progress_chars("#>-")
            );

            let pb_clone = pb.clone();
            let result = receive_file_stream(
                &mut stream,
                &out,
                Some(move |received, total, _speed| {
                    pb_clone.set_length(total);
                    pb_clone.set_position(received);
                }),
            )
            .await?;

            pb.finish_with_message("Received successfully!");
            println!("\n✅ Successfully received '{}'!", result.file_name);
            println!("SHA-256 Verified: {:x?}", result.file_sha256);
        }

        Commands::Send { target, file } => {
            if !file.exists() {
                anyhow::bail!("Source file {:?} does not exist!", file);
            }

            println!("🚀 Connecting to peer at {}...", target);
            let mut stream = connect_to_peer(&target).await?;

            let session = client_handshake(
                &mut stream,
                my_id,
                &my_name,
                std::env::consts::OS,
                1024 * 1024,
            )
            .await?;

            println!(
                "🤝 Handshake successful with '{}' ({})",
                session.remote_device_name, session.remote_device_id
            );

            let pb = ProgressBar::new(100);
            pb.set_style(
                ProgressStyle::default_bar()
                    .template("{spinner:.green} [{elapsed_precise}] [{bar:40.green/white}] {bytes}/{total_bytes} ({bytes_per_sec}, {eta})")
                    .expect("Valid template")
                    .progress_chars("#>-")
            );

            let pb_clone = pb.clone();
            let transfer_id = send_file_stream(
                &mut stream,
                &file,
                session.negotiated_chunk_size,
                Some(move |progress: TransferProgress| {
                    pb_clone.set_length(progress.total_bytes);
                    pb_clone.set_position(progress.bytes_sent);
                }),
            )
            .await?;

            pb.finish_with_message("Sent successfully!");
            println!("\n✅ File transfer {} completed and verified!", transfer_id);
        }

        Commands::Devices => {
            info!("Scanning for nearby LocalDrop devices...");
            println!("🔍 Searching for peers on local network (mDNS)...");
        }
    }

    Ok(())
}
