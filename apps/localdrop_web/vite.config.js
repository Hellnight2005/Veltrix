import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  // First pass: look specifically for Wi-Fi or Ethernet
  for (const name of Object.keys(interfaces)) {
    if (name.toLowerCase().includes('wsl') || name.toLowerCase().includes('veth') || name.toLowerCase().includes('vmnet')) {
      continue;
    }
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.')) {
          return iface.address;
        }
      }
    }
  }
  return '192.168.1.48';
}

export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  plugins: [
    {
      name: 'localdrop-lan-relay',
      configureServer(server) {
        const sseClients = new Set();
        const mediaDir = path.resolve(process.cwd(), '.media_cache');
        const rootPublicDir = path.resolve(process.cwd(), '../../public');
        const localPublicDir = path.resolve(process.cwd(), 'public');

        if (!fs.existsSync(mediaDir)) {
          fs.mkdirSync(mediaDir, { recursive: true });
        }

        const connectedPeers = new Map();

        function broadcastToAll(data) {
          const msg = `data: ${JSON.stringify(data)}\n\n`;
          for (const client of sseClients) {
            try { client.write(msg); } catch (e) { sseClients.delete(client); }
          }
        }

        server.middlewares.use((req, res, next) => {
          // Global CORS headers for LAN communication & APK compatibility
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
          res.setHeader('Access-Control-Allow-Headers', '*');

          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }

          // 0. Server Info endpoint for auto-discovery by Android Emulator / LAN peers
          if (req.url === '/api/server-info') {
            const hostIp = getLocalIp();
            const publicVideos = [];

            const scanDir = (dir, category) => {
              if (fs.existsSync(dir)) {
                try {
                  const files = fs.readdirSync(dir);
                  for (const f of files) {
                    const ext = path.extname(f).toLowerCase();
                    // Prioritize web-ready MP4/WebM with guaranteed hardware video decoding in browsers
                    if (['.mp4', '.webm'].includes(ext)) {
                      const stat = fs.statSync(path.join(dir, f));
                      if (stat.size > 50000) {
                        publicVideos.push({
                          filename: f,
                          category,
                          sizeBytes: stat.size,
                          sizeStr: (stat.size / (1024 * 1024)).toFixed(1) + ' MB',
                          streamUrl: `/api/stream/${encodeURIComponent(f)}`
                        });
                      }
                    }
                  }
                } catch (e) {}
              }
            };

            scanDir(rootPublicDir, 'Laptop Library');
            scanDir(localPublicDir, 'Local Public');
            scanDir(mediaDir, 'Transferred Media');

            // Prune stale peers (> 35s)
            const now = Date.now();
            for (const [id, p] of connectedPeers.entries()) {
              if (now - p.lastSeen > 35000) {
                connectedPeers.delete(id);
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              ok: true,
              hostIp,
              emulatorHost: '10.0.2.2:5173',
              lanHost: `${hostIp}:5173`,
              port: 5173,
              videos: publicVideos,
              peers: Array.from(connectedPeers.values())
            }));
            return;
          }

          // 0.1 AirDrop Peer Heartbeat & Auto-Discovery Registration
          if (req.url === '/api/peers/heartbeat' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const peer = JSON.parse(body);
                peer.lastSeen = Date.now();
                peer.remoteIp = req.socket.remoteAddress;
                connectedPeers.set(peer.id, peer);

                const now = Date.now();
                for (const [id, p] of connectedPeers.entries()) {
                  if (now - p.lastSeen > 35000) {
                    connectedPeers.delete(id);
                  }
                }

                const peerList = Array.from(connectedPeers.values());
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, peers: peerList }));

                broadcastToAll({
                  type: 'PEERS_UPDATED',
                  payload: { peers: peerList }
                });
              } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
              }
            });
            return;
          }

          if (req.url === '/api/peers' && req.method === 'GET') {
            const now = Date.now();
            for (const [id, p] of connectedPeers.entries()) {
              if (now - p.lastSeen > 35000) {
                connectedPeers.delete(id);
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, peers: Array.from(connectedPeers.values()) }));
            return;
          }

          // 1. SSE Connection for LAN event broadcast across all devices
          if (req.url === '/api/events') {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive',
            });
            res.write(': connected\n\n');
            sseClients.add(res);

            req.on('close', () => {
              sseClients.delete(res);
            });
            return;
          }

          // 2. Broadcast endpoint for real-time play/pause/seek/switch events
          if (req.url === '/api/broadcast' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                broadcastToAll(parsed);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, recipients: sseClients.size }));
              } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
              }
            });
            return;
          }

          // 3. Chunked Upload endpoint (reliable for large 1GB+ video files)
          // 3. Progressive Direct-Append Stream Upload (Immediate zero-wait streaming)
          if (req.url.startsWith('/api/upload-chunk') && req.method === 'POST') {
            const urlObj = new URL(req.url, 'http://localhost:5173');
            const fileId = urlObj.searchParams.get('fileId') || 'upload';
            const filename = decodeURIComponent(urlObj.searchParams.get('filename') || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
            const chunkIndex = parseInt(urlObj.searchParams.get('index') || '0', 10);
            const totalChunks = parseInt(urlObj.searchParams.get('total') || '1', 10);

            const finalPath = path.join(mediaDir, filename);
            const writeStream = fs.createWriteStream(finalPath, {
              flags: chunkIndex === 0 ? 'w' : 'a'
            });

            req.pipe(writeStream);
            writeStream.on('finish', () => {
              const isLast = chunkIndex >= totalChunks - 1;
              let currentSize = 0;
              try { currentSize = fs.statSync(finalPath).size; } catch (e) {}

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: true,
                complete: isLast,
                chunk: chunkIndex,
                streamUrl: `/api/stream/${encodeURIComponent(filename)}`,
                filename,
                size: currentSize
              }));
            });
            writeStream.on('error', (err) => {
              res.writeHead(500);
              res.end(err.message);
            });
            return;
          }

          // 4. Direct Upload fallback
          if (req.url.startsWith('/api/upload') && req.method === 'POST') {
            const rawFilename = req.headers['x-filename'] || `video-${Date.now()}.mp4`;
            const filename = decodeURIComponent(rawFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
            const targetPath = path.join(mediaDir, filename);
            const writeStream = fs.createWriteStream(targetPath);

            req.pipe(writeStream);
            writeStream.on('finish', () => {
              const fileStats = fs.statSync(targetPath);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: true,
                streamUrl: `/api/stream/${encodeURIComponent(filename)}`,
                filename,
                size: fileStats.size
              }));
            });
            writeStream.on('error', (err) => {
              res.writeHead(500);
              res.end(err.message);
            });
            return;
          }

          // 5. Media Streaming with HTTP 206 Range Support
          if (req.url.startsWith('/api/stream/')) {
            let rawFilename = decodeURIComponent(req.url.replace('/api/stream/', ''));

            // Generic auto-fallback: if MKV is requested, check if a matching web MP4 exists
            if (rawFilename.toLowerCase().endsWith('.mkv')) {
              const mp4Name = rawFilename.replace(/\.mkv$/i, '.mp4');
              if (fs.existsSync(path.join(rootPublicDir, mp4Name)) || fs.existsSync(path.join(mediaDir, mp4Name))) {
                rawFilename = mp4Name;
              }
            }

            // Look in mediaDir, rootPublicDir, and localPublicDir
            const candidatePaths = [
              path.join(mediaDir, rawFilename),
              path.join(rootPublicDir, rawFilename),
              path.join(localPublicDir, rawFilename),
            ];

            let filePath = candidatePaths.find((p) => fs.existsSync(p));

            if (!filePath) {
              res.writeHead(404);
              res.end('File Not Found');
              return;
            }

            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;

            const ext = path.extname(rawFilename).toLowerCase();
            const mimeMap = {
              '.mp4': 'video/mp4',
              '.m4v': 'video/mp4',
              '.mkv': 'video/x-matroska',
              '.webm': 'video/webm',
              '.mov': 'video/quicktime',
              '.avi': 'video/x-msvideo',
              '.mp3': 'audio/mpeg',
              '.wav': 'audio/wav',
              '.ogg': 'audio/ogg',
              '.vtt': 'text/vtt; charset=utf-8',
              '.srt': 'text/vtt; charset=utf-8',
            };
            const contentType = mimeMap[ext] || (ext === '.vtt' ? 'text/vtt; charset=utf-8' : 'video/mp4');

            if (range) {
              const parts = range.replace(/bytes=/, '').split('-');
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
              const chunksize = (end - start) + 1;
              const file = fs.createReadStream(filePath, { start, end });
              const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
              };
              res.writeHead(206, head);
              file.pipe(res);
            } else {
              const head = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
              };
              res.writeHead(200, head);
              fs.createReadStream(filePath).pipe(res);
            }
            return;
          }

          next();
        });
      }
    }
  ]
});
