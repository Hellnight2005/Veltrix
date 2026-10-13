use clap::{Parser, Subcommand};
use tracing::info;

#[derive(Parser)]
#[command(name = "localdrop")]
#[command(about = "Privacy-first peer-to-peer local file transfer", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Receive files from a peer
    Receive {
        #[arg(short, long, default_value_t = 8080)]
        port: u16,

        #[arg(short, long, default_value = "./inbox")]
        out: String,
    },
    /// Send a file to a remote peer (IP:PORT or peer address)
    Send {
        #[arg(help = "Destination peer address (e.g. 192.168.1.50:8080)")]
        target: String,

        #[arg(help = "Path to file to transmit")]
        file: String,
    },
    /// Discover nearby peers on the local network
    Devices,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Receive { port, out } => {
            info!(
                "LocalDrop receiver starting on port {} into '{}'",
                port, out
            );
            println!("LocalDrop receiver listening on port {}...", port);
        }
        Commands::Send { target, file } => {
            info!("LocalDrop sender dispatching '{}' to {}", file, target);
            println!("Sending '{}' to {}...", file, target);
        }
        Commands::Devices => {
            info!("Scanning for nearby LocalDrop devices...");
            println!("Searching for peers on local network...");
        }
    }

    Ok(())
}
