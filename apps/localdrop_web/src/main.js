/**
 * LocalDrop Cast — Phone Media Server to TV Client Architecture
 * 
 * Features:
 * - Direct Gallery & Local File Access (Video, Audio)
 * - Auto-Discovery of Laptop/TV Receivers on Wi-Fi
 * - One-Tap "Choose Video & Cast" directly from Phone Gallery
 * - Real-Time WebRTC P2P Video Streaming & HTTP 206 Chunked Fallback
 * - Real-Time TV Remote Controller (Play, Pause, Scrubber, Mute)
 * - Auto-Handoff on Pause/Stop with Zero Battery Drain
 * - Live Transfer Progress HUD on both phone and laptop screens
 */

document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------------------------------------------------------
  // 1. Initial State & AirDrop Device Identity & Pairing Store
  // ---------------------------------------------------------------------------
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;

  let myClientId = localStorage.getItem('localdrop_client_id');
  if (!myClientId) {
    myClientId = 'peer-' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('localdrop_client_id', myClientId);
  }

  let myDeviceName = localStorage.getItem('localdrop_device_name');
  if (!myDeviceName) {
    myDeviceName = isMobileDevice ? 'Vivo Phone (Mobile)' : "Abhijeet's Laptop Screen";
    localStorage.setItem('localdrop_device_name', myDeviceName);
  }

  // Persistent Paired Peers Store (Remembered across sessions and reconnects)
  function getPairedPeers() {
    try {
      const raw = localStorage.getItem('localdrop_paired_peers');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function savePairedPeer(peerId) {
    const peers = getPairedPeers();
    peers.add(peerId);
    localStorage.setItem('localdrop_paired_peers', JSON.stringify(Array.from(peers)));
    renderNearbyPeers();
  }

  function isPeerPaired(peerId) {
    return getPairedPeers().has(peerId);
  }

  const state = {
    myClientId,
    deviceName: myDeviceName,
    currentMode: isMobileDevice ? 'phone' : 'tv', // Default to clean view
    isFramedShell: !isMobileDevice,
    activeRole: 'idle', // 'idle' | 'sender' | 'receiver'
    targetDevice: {
      id: 'tv-livingroom',
      name: isMobileDevice ? "Abhijeet's Laptop Screen" : 'Vivo Phone (Mobile)',
      ip: window.location.hostname !== 'localhost' ? window.location.host : '192.168.0.103:5173',
      type: isMobileDevice ? 'tv' : 'phone',
      signal: '99%',
    },
    activeVideoIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isMutedOnTv: false,
    throughputSpeed: '78.4 MB/s',
    pausedHandoffTimestamp: 0,
  };

  let nearbyPeers = [];
  let pendingAirDropOffer = null;
  let targetAirDropPeerId = null;

  // Shared Phone Media Gallery (Starts empty - only real videos chosen by the user!)
  const sharedGallery = [];

  // ---------------------------------------------------------------------------
  // 2. DOM Elements
  // ---------------------------------------------------------------------------
  // Top Banner / Modes
  const btnModePhone = document.getElementById('btnModePhone');
  const btnModeTV = document.getElementById('btnModeTV');
  const btnModeDual = document.getElementById('btnModeDual');
  const btnToggleMobileFrame = document.getElementById('btnToggleMobileFrame');
  const frameToggleLabel = document.getElementById('frameToggleLabel');
  const mobileDeviceShell = document.getElementById('mobileDeviceShell');

  // Hero Discovered Screen Card on Phone
  const btnHeroSelectVideo = document.getElementById('btnHeroSelectVideo');
  const btnHeroCastAction = document.getElementById('btnHeroCastAction');
  const heroTargetDeviceTitle = document.getElementById('heroTargetDeviceTitle');

  // Phone Player & Controls
  const phoneVideo = document.getElementById('phoneVideoPlayer');
  const phoneVideoOverlay = document.getElementById('phoneVideoOverlay');
  const phoneOverlayPlayBtn = document.getElementById('phoneOverlayPlayBtn');
  const phoneOverlayIcon = document.getElementById('phoneOverlayIcon');
  const phoneBtnPlayPause = document.getElementById('phoneBtnPlayPause');
  const phonePlayPauseIcon = document.getElementById('phonePlayPauseIcon');
  const phoneBtnPrev = document.getElementById('phoneBtnPrev');
  const phoneBtnNext = document.getElementById('phoneBtnNext');
  const phoneBtnSkipBack = document.getElementById('phoneBtnSkipBack');
  const phoneBtnSkipForward = document.getElementById('phoneBtnSkipForward');
  const phoneNowPlayingTitle = document.getElementById('phoneNowPlayingTitle');
  const phoneServerIp = document.getElementById('phoneServerIp');
  const phoneScrubberTrack = document.getElementById('phoneScrubberTrack');
  const phoneScrubberFill = document.getElementById('phoneScrubberFill');
  const phoneScrubberThumb = document.getElementById('phoneScrubberThumb');
  const phoneTimeCurrent = document.getElementById('phoneTimeCurrent');
  const phoneTimeDuration = document.getElementById('phoneTimeDuration');
  const btnPhoneStopHandoff = document.getElementById('btnPhoneStopHandoff');
  const btnPhoneMuteToggle = document.getElementById('btnPhoneMuteToggle');
  const phoneVolumeLabel = document.getElementById('phoneVolumeLabel');
  const selectedTargetDeviceName = document.getElementById('selectedTargetDeviceName');
  const btnCastTargetSelector = document.getElementById('btnCastTargetSelector');

  // Phone Gallery & Storage Picker
  const phoneGalleryList = document.getElementById('phoneGalleryList');
  const phoneMediaFileInput = document.getElementById('phoneMediaFileInput');
  const btnPickGalleryDirect = document.getElementById('btnPickGalleryDirect');
  const btnUploadMoreGallery = document.getElementById('btnUploadMoreGallery');

  // TV Screen Client
  const tvVideo = document.getElementById('tvVideoPlayer');
  const tvPlayPrompt = document.getElementById('tvPlayPrompt');
  const tvStandbyScreen = document.getElementById('tvStandbyScreen');
  const standbyPhoneUrl = document.getElementById('standbyPhoneUrl');
  const standbyProgressWrap = document.getElementById('standbyProgressWrap');
  const standbyProgressLabel = document.getElementById('standbyProgressLabel');
  const standbyProgressPercent = document.getElementById('standbyProgressPercent');
  const standbyProgressFill = document.getElementById('standbyProgressFill');
  const tvNowPlayingTitle = document.getElementById('tvNowPlayingTitle');
  const tvSourceDeviceName = document.getElementById('tvSourceDeviceName');
  const tvTimeCurrent = document.getElementById('tvTimeCurrent');
  const tvTimeTotal = document.getElementById('tvTimeTotal');
  const tvTimelineFill = document.getElementById('tvTimelineFill');
  const tvTimelineMarker = document.getElementById('tvTimelineMarker');
  const tvCardsCarousel = document.getElementById('tvCardsCarousel');
  const tvGalleryCountTag = document.getElementById('tvGalleryCountTag');
  const tvClockDisplay = document.getElementById('tvClockDisplay');
  const statusClock = document.getElementById('statusClock');

  // Modals & Toasts
  const devicePickerModal = document.getElementById('devicePickerModal');
  const btnCloseDevicePicker = document.getElementById('btnCloseDevicePicker');
  const btnConfirmTargetDevice = document.getElementById('btnConfirmTargetDevice');
  const stopHandoffModal = document.getElementById('stopHandoffModal');
  const btnCloseStopHandoff = document.getElementById('btnCloseStopHandoff');
  const modalPausedTimeSubtitle = document.getElementById('modalPausedTimeSubtitle');
  const choiceTvTimestamp = document.getElementById('choiceTvTimestamp');
  const btnHandoffToTV = document.getElementById('btnHandoffToTV');
  const btnOpenPhoneGalleryPicker = document.getElementById('btnOpenPhoneGalleryPicker');
  const toastContainer = document.getElementById('toastContainer');
  const toastHeading = document.getElementById('toastHeading');
  const toastDetail = document.getElementById('toastDetail');

  // AirDrop DOM Elements
  const myDeviceNameEl = document.getElementById('myDeviceName');
  const myDeviceSubEl = document.getElementById('myDeviceSub');
  const myDeviceAvatarEl = document.getElementById('myDeviceAvatar');
  const airdropPeerCount = document.getElementById('airdropPeerCount');
  const airdropPeersList = document.getElementById('airdropPeersList');
  const airdropPeerFileInput = document.getElementById('airdropPeerFileInput');

  // AirDrop Modal
  const airDropReceiveModal = document.getElementById('airDropReceiveModal');
  const airDropSenderAvatar = document.getElementById('airDropSenderAvatar');
  const airDropSenderTitle = document.getElementById('airDropSenderTitle');
  const airDropFileName = document.getElementById('airDropFileName');
  const airDropFileSize = document.getElementById('airDropFileSize');
  const chkAlwaysAutoAccept = document.getElementById('chkAlwaysAutoAccept');
  const btnAirDropAccept = document.getElementById('btnAirDropAccept');
  const btnAirDropDecline = document.getElementById('btnAirDropDecline');

  // Broadcast Channel for same-browser multi-tab sync
  const castChannel = window.BroadcastChannel ? new BroadcastChannel('localdrop_cast_sync') : null;

  // ---------------------------------------------------------------------------
  // 3. Helper Functions & Network Address Management
  // ---------------------------------------------------------------------------
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function showToast(title, desc) {
    if (!toastContainer) return;
    toastHeading.textContent = title;
    toastDetail.textContent = desc;
    toastContainer.classList.add('toast-visible');
    setTimeout(() => {
      toastContainer.classList.remove('toast-visible');
    }, 4500);
  }

  function updateClocks() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${h}:${m}`;
    if (statusClock) statusClock.textContent = timeStr;
    if (tvClockDisplay) tvClockDisplay.textContent = timeStr;
  }
  updateClocks();
  setInterval(updateClocks, 30000);

  let activeApiBase = '';

  function getApiBaseUrl() {
    if (activeApiBase) return activeApiBase;
    const isCapacitor = window.Capacitor !== undefined || window.location.protocol === 'capacitor:';
    if (isCapacitor) {
      const saved = localStorage.getItem('localdrop_server_ip');
      return saved ? `http://${saved}` : 'http://10.0.2.2:5173';
    }
    return window.location.origin && window.location.origin !== 'null' ? window.location.origin : 'http://localhost:5173';
  }

  function updateServerIpDisplay(info) {
    const isCapacitor = window.Capacitor !== undefined || window.location.protocol === 'capacitor:';
    let currentIp = activeApiBase ? activeApiBase.replace(/^https?:\/\//, '') : (info ? (isCapacitor ? info.emulatorHost : info.lanHost) : window.location.host);
    if (!currentIp || currentIp === 'null') currentIp = '192.168.0.103:5173';

    if (phoneServerIp) {
      phoneServerIp.textContent = currentIp;
      phoneServerIp.title = 'Tap to edit Laptop Server IP';
      phoneServerIp.style.cursor = 'pointer';
    }
    if (standbyPhoneUrl) {
      standbyPhoneUrl.textContent = `http://${info ? info.lanHost : currentIp}`;
    }
    if (heroTargetDeviceTitle) {
      heroTargetDeviceTitle.textContent = `${state.targetDevice.name} (${currentIp})`;
    }
    if (myDeviceNameEl) {
      myDeviceNameEl.textContent = state.deviceName;
    }
    if (myDeviceSubEl) {
      myDeviceSubEl.textContent = `Wi-Fi LAN · ${currentIp}`;
    }
    if (myDeviceAvatarEl) {
      myDeviceAvatarEl.textContent = isMobileDevice ? '📱' : '💻';
    }
  }

  // ---------------------------------------------------------------------------
  // AirDrop Peer Management & Heartbeat
  // ---------------------------------------------------------------------------
  async function sendHeartbeat() {
    const base = getApiBaseUrl();
    if (!base) return;
    try {
      const payload = {
        id: state.myClientId,
        name: state.deviceName,
        type: isMobileDevice ? 'phone' : 'laptop',
        avatar: isMobileDevice ? '📱' : '💻',
      };
      const res = await fetch(`${base}/api/peers/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.peers) {
          updateNearbyPeers(data.peers);
        }
      }
    } catch (e) {}
  }
  setInterval(sendHeartbeat, 5000);

  function updateNearbyPeers(peersList) {
    nearbyPeers = peersList.filter((p) => p.id !== state.myClientId);
    renderNearbyPeers();
  }

  function renderNearbyPeers() {
    if (!airdropPeersList) return;
    if (nearbyPeers.length === 0) {
      if (airdropPeerCount) airdropPeerCount.textContent = 'Searching...';
      airdropPeersList.innerHTML = `
        <div class="peer-scanning-skeleton">
          <span class="pulse-loader"></span>
          <span>Listening for nearby LocalDrop peers on local Wi-Fi...</span>
        </div>
      `;
      return;
    }

    if (airdropPeerCount) airdropPeerCount.textContent = `${nearbyPeers.length} Online`;
    airdropPeersList.innerHTML = '';

    nearbyPeers.forEach((peer) => {
      const isPaired = isPeerPaired(peer.id);
      const card = document.createElement('div');
      card.className = `airdrop-peer-card ${isPaired ? 'peer-paired' : ''}`;
      card.title = isPaired ? `Paired with ${peer.name}. Tap to AirDrop video!` : `Tap to pair and AirDrop with ${peer.name}`;
      card.innerHTML = `
        <div class="peer-card-avatar">${peer.type === 'phone' ? '📱' : '💻'}</div>
        <div class="peer-card-info">
          <div class="peer-card-title">${peer.name}</div>
          <div class="peer-card-meta">
            ${isPaired ? '<span class="badge-paired">✓ Paired</span>' : '<span style="color: #6366f1; font-weight: 600;">Tap to Pair</span>'}
            <span>${peer.type === 'phone' ? 'Mobile' : 'Screen'}</span>
          </div>
        </div>
        <button class="btn-peer-action">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>${isPaired ? 'AirDrop' : 'Pair & Drop'}</span>
        </button>
      `;

      card.addEventListener('click', () => {
        targetAirDropPeerId = peer.id;
        state.targetDevice = {
          id: peer.id,
          name: peer.name,
          type: peer.type,
        };

        if (!isPaired) {
          savePairedPeer(peer.id);
          broadcastMessage('AIRDROP_PAIR_REQUEST', {
            fromId: state.myClientId,
            fromName: state.deviceName,
            toId: peer.id,
          });
          showToast(`Paired with ${peer.name}!`, 'Future AirDrop streams will connect automatically.');
        }

        if (airdropPeerFileInput) {
          airdropPeerFileInput.click();
        }
      });

      airdropPeersList.appendChild(card);
    });
  }

  // AirDrop File Input Handler
  if (airdropPeerFileInput) {
    airdropPeerFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !targetAirDropPeerId) return;

      const targetPeer = nearbyPeers.find((p) => p.id === targetAirDropPeerId) || state.targetDevice;
      showToast(`AirDropping '${file.name}'`, `Preparing stream to ${targetPeer.name}...`);

      try {
        const streamUrl = await uploadFileInChunks(file, (percent, mbCurrent, mbTotal) => {
          broadcastMessage('TRANSFER_PROGRESS', {
            filename: file.name,
            percent,
            mbCurrent,
            mbTotal,
          });
        });

        const fullStreamUrl = streamUrl.startsWith('http') ? streamUrl : `${getApiBaseUrl()}${streamUrl}`;

        // Adapt sender role automatically
        adaptRole('sender', targetPeer, { title: file.name, url: fullStreamUrl });

        // Beams AirDrop Offer to target peer
        broadcastMessage('AIRDROP_OFFER', {
          fromId: state.myClientId,
          fromName: state.deviceName,
          fromType: isMobileDevice ? 'phone' : 'laptop',
          toId: targetAirDropPeerId,
          video: {
            title: file.name,
            url: fullStreamUrl,
            sizeStr: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          },
        });

        showToast(`AirDrop Beaming!`, `'${file.name}' streaming to ${targetPeer.name}`);
      } catch (err) {
        showToast('AirDrop Error', err.message);
      }
    });
  }

  // AirDrop Receive Modal Actions
  if (btnAirDropAccept) {
    btnAirDropAccept.addEventListener('click', () => {
      if (!pendingAirDropOffer) return;
      const { fromId, fromName, video } = pendingAirDropOffer;
      if (chkAlwaysAutoAccept && chkAlwaysAutoAccept.checked) {
        savePairedPeer(fromId);
      }
      airDropReceiveModal.classList.remove('modal-open');

      adaptRole('receiver', { id: fromId, name: fromName }, video);

      broadcastMessage('AIRDROP_ACCEPT', {
        fromId: state.myClientId,
        fromName: state.deviceName,
        toId: fromId,
        video,
      });

      pendingAirDropOffer = null;
    });
  }

  if (btnAirDropDecline) {
    btnAirDropDecline.addEventListener('click', () => {
      airDropReceiveModal.classList.remove('modal-open');
      pendingAirDropOffer = null;
      showToast('AirDrop Declined', 'Transfer was cancelled');
    });
  }

  // Adaptive Role Switcher Function (AirDrop Engine Core)
  function adaptRole(role, peer, video) {
    state.activeRole = role;
    let streamUrl = video.url;
    if (streamUrl && !streamUrl.startsWith('http://') && !streamUrl.startsWith('https://')) {
      streamUrl = `${getApiBaseUrl()}${streamUrl.startsWith('/') ? '' : '/'}${streamUrl}`;
    }

    // Always hide standby screen when any video is initiated
    if (tvStandbyScreen) tvStandbyScreen.style.display = 'none';
    if (standbyProgressWrap) standbyProgressWrap.style.display = 'none';

    if (role === 'receiver') {
      applyViewMode('tv');
      tvVideo.srcObject = null;
      tvVideo.src = streamUrl;
      tvNowPlayingTitle.textContent = video.title;
      if (tvSourceDeviceName) {
        tvSourceDeviceName.textContent = `AirDrop Stream from: ${peer.name} · Direct LAN`;
      }

      tvVideo.muted = false;
      state.isMutedOnTv = false;
      tvVideo.play().then(() => {
        if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
      }).catch(() => {
        tvVideo.muted = true;
        state.isMutedOnTv = true;
        tvVideo.play().catch(() => {});
        if (tvPlayPrompt) tvPlayPrompt.classList.remove('prompt-hidden');
      });
      updatePlayPauseIcons(true);
      showToast(`AirDrop Connected`, `Now playing '${video.title}' from ${peer.name}`);
    } else if (role === 'sender') {
      applyViewMode(isMobileDevice ? 'phone' : 'dual');
      phoneNowPlayingTitle.textContent = video.title;
      phoneVideo.src = streamUrl;
      phoneVideo.play().catch(() => {});

      // On Laptop/Desktop screen, also play directly on the main TV screen!
      if (!isMobileDevice) {
        tvVideo.srcObject = null;
        tvVideo.src = streamUrl;
        tvNowPlayingTitle.textContent = video.title;
        if (tvSourceDeviceName) {
          tvSourceDeviceName.textContent = `Serving to: ${peer.name} · Direct LAN`;
        }
        tvVideo.muted = false;
        state.isMutedOnTv = false;
        tvVideo.play().then(() => {
          if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
        }).catch(() => {
          tvVideo.muted = true;
          state.isMutedOnTv = true;
          tvVideo.play().catch(() => {});
          if (tvPlayPrompt) tvPlayPrompt.classList.remove('prompt-hidden');
        });
      }

      updatePlayPauseIcons(true);
      showToast(`AirDrop Active`, `Serving '${video.title}' to ${peer.name}`);
    }
  }

  async function discoverAndConnectServer() {
    const candidates = [
      window.location.origin,
      'http://localhost:5173',
      'http://192.168.0.103:5173',
      'http://10.0.2.2:5173',
      'http://192.168.1.48:5173',
    ];
    const saved = localStorage.getItem('localdrop_server_ip');
    if (saved) candidates.unshift(`http://${saved}`);

    for (const base of candidates) {
      if (!base || base === 'null') continue;
      try {
        const res = await fetch(`${base}/api/server-info`, { signal: AbortSignal.timeout(1200) });
        if (res.ok) {
          const info = await res.json();
          activeApiBase = base;
          localStorage.setItem('localdrop_server_ip', base.replace(/^https?:\/\//, ''));
          updateServerIpDisplay(info);
          if (info.videos) {
            populateServerVideos(info.videos);
            renderAirDropMovies(info.videos);
            renderLaptopLibrary(info.videos);
          }
          if (info.peers) {
            updateNearbyPeers(info.peers);
          }
          initLanSync();
          sendHeartbeat();
          return base;
        }
      } catch (e) {}
    }
    updateServerIpDisplay();
  }

  if (phoneServerIp) {
    phoneServerIp.addEventListener('click', () => {
      const current = localStorage.getItem('localdrop_server_ip') || '10.0.2.2:5173';
      const entered = prompt('Enter Laptop Wi-Fi IP and Port (e.g. 10.0.2.2:5173 or 192.168.1.48:5173):', current);
      if (entered && entered.trim()) {
        const cleaned = entered.trim().replace(/^https?:\/\//, '');
        localStorage.setItem('localdrop_server_ip', cleaned);
        activeApiBase = `http://${cleaned}`;
        updateServerIpDisplay();
        showToast('Server IP Updated', `Connecting to http://${cleaned}`);
        initLanSync();
      }
    });
  }

  // SVG Icons
  const playSvg = `<polygon points="5 3 19 12 5 21 5 3"/>`;
  const pauseSvg = `<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>`;

  // ---------------------------------------------------------------------------
  // 4. View Mode Switcher (Phone, TV, Dual) & Mobile Responsiveness
  // ---------------------------------------------------------------------------
  function applyViewMode(mode) {
    state.currentMode = mode;
    document.body.classList.remove('mode-phone-only', 'mode-tv-only', 'mode-dual-view');

    btnModePhone.classList.remove('active-mode');
    btnModeTV.classList.remove('active-mode');
    btnModeDual.classList.remove('active-mode');

    if (mode === 'phone') {
      document.body.classList.add('mode-phone-only');
      btnModePhone.classList.add('active-mode');
    } else if (mode === 'tv') {
      document.body.classList.add('mode-tv-only');
      btnModeTV.classList.add('active-mode');
    } else {
      document.body.classList.add('mode-dual-view');
      btnModeDual.classList.add('active-mode');
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const requestedMode = urlParams.get('mode');
  const initialMode = requestedMode || (isMobileDevice ? 'phone' : 'dual');
  applyViewMode(initialMode);

  if (isMobileDevice) {
    state.isFramedShell = false;
    mobileDeviceShell.classList.add('unframed-mode');
    if (frameToggleLabel) frameToggleLabel.textContent = 'Shell: OFF';
  }

  btnModePhone.addEventListener('click', () => applyViewMode('phone'));
  btnModeTV.addEventListener('click', () => applyViewMode('tv'));
  btnModeDual.addEventListener('click', () => applyViewMode('dual'));

  btnToggleMobileFrame.addEventListener('click', () => {
    state.isFramedShell = !state.isFramedShell;
    if (state.isFramedShell) {
      mobileDeviceShell.classList.remove('unframed-mode');
      frameToggleLabel.textContent = 'Shell: ON';
    } else {
      mobileDeviceShell.classList.add('unframed-mode');
      frameToggleLabel.textContent = 'Shell: OFF';
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Gallery Rendering: Phone List & TV Carousel (Empty until user selects videos!)
  // ---------------------------------------------------------------------------
  function renderGalleries() {
    phoneGalleryList.innerHTML = '';
    if (sharedGallery.length === 0) {
      phoneGalleryList.innerHTML = `
        <div class="gallery-empty-state">
          <p>📂 No videos added yet.</p>
          <p style="font-size: 11px; margin-top: 4px; color: #64748b;">Tap <strong>"Choose Video & Cast"</strong> above to pick any video from your phone gallery!</p>
        </div>
      `;
    } else {
      sharedGallery.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = `gallery-item-card ${index === state.activeVideoIndex ? 'active-stream' : ''}`;
        card.innerHTML = `
          <div class="item-thumb-box">
            <img src="${item.thumb}" alt="${item.title}" loading="lazy" />
            <span class="item-duration-pill">${item.durationStr}</span>
          </div>
          <div class="item-info-box">
            <h4 class="item-title">${item.title}</h4>
            <p class="item-meta">${item.category} · ${item.sizeStr}</p>
          </div>
          <button class="item-cast-action">${index === state.activeVideoIndex ? '● Playing' : 'Stream'}</button>
        `;

        card.addEventListener('click', () => {
          selectAndPlayVideo(index, true);
          showToast(`Streaming '${item.title}'`, `Beaming to ${state.targetDevice.name}`);
        });

        phoneGalleryList.appendChild(card);
      });
    }

    tvCardsCarousel.innerHTML = '';
    if (sharedGallery.length === 0) {
      tvCardsCarousel.innerHTML = `
        <div class="gallery-empty-state" style="width: 100%; border: none;">
          <p>Waiting for you to pick a video from your phone...</p>
        </div>
      `;
      tvGalleryCountTag.textContent = '0 Videos';
    } else {
      tvGalleryCountTag.textContent = `${sharedGallery.length} Videos Available`;
      sharedGallery.forEach((item, index) => {
        const tvCard = document.createElement('div');
        tvCard.className = `tv-media-card ${index === state.activeVideoIndex ? 'active-tv-card' : ''}`;
        tvCard.innerHTML = `
          <div class="tv-card-thumb-wrap">
            <img src="${item.thumb}" alt="${item.title}" loading="lazy" />
            <div class="tv-card-play-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
            <span class="tv-card-len-badge">${item.durationStr}</span>
          </div>
          <div class="tv-card-info">
            <h4 class="tv-card-title">${item.title}</h4>
            <p class="tv-card-meta">${item.category} · ${item.sizeStr}</p>
          </div>
        `;

        tvCard.addEventListener('click', () => {
          selectAndPlayVideo(index, true);
          showToast(`TV Switched to '${item.title}'`, `Streaming from Phone Server · ${item.sizeStr}`);
        });

        tvCardsCarousel.appendChild(tvCard);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. WebRTC P2P Direct Media Stream Engine (Instant, Zero-Wait Casting)
  // ---------------------------------------------------------------------------
  let rtcPeer = null;

  function initRtcPeer() {
    if (rtcPeer) {
      try { rtcPeer.close(); } catch (e) {}
    }
    rtcPeer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    rtcPeer.onicecandidate = (event) => {
      if (event.candidate) {
        broadcastMessage('WEBRTC_ICE', { candidate: event.candidate });
      }
    };
    return rtcPeer;
  }

  function startWebRtcSender(stream, videoTitle) {
    const pc = initRtcPeer();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        broadcastMessage('WEBRTC_OFFER', { sdp: pc.localDescription, title: videoTitle });
      })
      .catch((err) => console.warn('WebRTC offer error:', err));
  }

  function handleWebRtcOffer(offerSdp, videoTitle) {
    const pc = initRtcPeer();
    pc.ontrack = (event) => {
      console.log('🎬 WebRTC media track received from Phone!');
      if (tvStandbyScreen) tvStandbyScreen.style.display = 'none';
      if (standbyProgressWrap) standbyProgressWrap.style.display = 'none';
      tvVideo.srcObject = event.streams[0];
      tvNowPlayingTitle.textContent = videoTitle || 'Live Stream from Phone';
      tvVideo.muted = false;
      state.isMutedOnTv = false;
      tvVideo.play().then(() => {
        if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
      }).catch(() => {
        // Browser Autoplay Policy blocked unmuted playback: play muted immediately so video displays
        tvVideo.muted = true;
        state.isMutedOnTv = true;
        tvVideo.play().catch(() => {});
        if (tvPlayPrompt) tvPlayPrompt.classList.remove('prompt-hidden');
      });
      showToast('Live Stream Connected', `Playing '${videoTitle}' from Phone`);
    };

    pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
      .then(() => pc.createAnswer())
      .then((answer) => pc.setLocalDescription(answer))
      .then(() => {
        broadcastMessage('WEBRTC_ANSWER', { sdp: pc.localDescription });
      })
      .catch((err) => console.warn('WebRTC answer error:', err));
  }

  function handleWebRtcAnswer(answerSdp) {
    if (rtcPeer && rtcPeer.signalingState !== 'stable') {
      rtcPeer.setRemoteDescription(new RTCSessionDescription(answerSdp)).catch((e) => console.warn(e));
    }
  }

  function handleWebRtcIce(candidate) {
    if (rtcPeer && candidate) {
      rtcPeer.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) => console.warn(e));
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Progressive Chunked Media Streamer (8MB slices for high-speed LAN)
  // ---------------------------------------------------------------------------
  async function uploadFileInChunks(file, onProgress, onFirstChunk) {
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB slices (4x faster on Wi-Fi)
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const filename = encodeURIComponent(file.name);
    let streamUrlReported = false;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunkBlob = file.slice(start, end);

      const url = `${getApiBaseUrl()}/api/upload-chunk?fileId=${fileId}&filename=${filename}&index=${i}&total=${totalChunks}`;
      const res = await fetch(url, { method: 'POST', body: chunkBlob });
      const data = await res.json();

      const percent = Math.round(((i + 1) / totalChunks) * 100);
      const mbCurrent = (end / (1024 * 1024)).toFixed(1);
      const mbTotal = (file.size / (1024 * 1024)).toFixed(1);

      if (onProgress) {
        onProgress(percent, mbCurrent, mbTotal);
      }

      broadcastMessage('TRANSFER_PROGRESS', {
        filename: file.name,
        percent,
        mbCurrent,
        mbTotal,
      });

      // From chunk 0: file header is written and stream is playable!
      if (!streamUrlReported && data.streamUrl && onFirstChunk) {
        streamUrlReported = true;
        onFirstChunk(data.streamUrl);
      }

      if (data.complete && data.streamUrl) {
        return data.streamUrl;
      }
    }
    return `/api/stream/${filename}`;
  }

  // ---------------------------------------------------------------------------
  // 8. Media File Picker & Direct Phone Storage Access
  // ---------------------------------------------------------------------------
  function triggerStoragePicker() {
    phoneMediaFileInput.click();
  }

  if (btnHeroSelectVideo) {
    btnHeroSelectVideo.addEventListener('click', triggerStoragePicker);
  }
  if (btnHeroCastAction) {
    btnHeroCastAction.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerStoragePicker();
    });
  }

  btnPickGalleryDirect.addEventListener('click', triggerStoragePicker);
  btnUploadMoreGallery.addEventListener('click', triggerStoragePicker);

  phoneMediaFileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    files.forEach((file) => {
      const localFileUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video');

      const newEntry = {
        id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        title: file.name,
        category: 'Phone Gallery',
        durationStr: '00:00',
        durationSec: 0,
        sizeStr: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        url: localFileUrl,
        thumb: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&auto=format&fit=crop&q=80',
        sourceType: 'user_storage',
      };

      if (isVideo) {
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = localFileUrl;
        tempVideo.addEventListener('loadedmetadata', () => {
          newEntry.durationSec = Math.round(tempVideo.duration);
          newEntry.durationStr = formatTime(tempVideo.duration);
          renderGalleries();
        });
      }

      sharedGallery.unshift(newEntry);
      renderGalleries();

      // 1. Start local playback on phone
      selectAndPlayVideo(0, true);

      // 2. Broadcast video metadata to Laptop IMMEDIATELY (so laptop knows title & size)
      broadcastMessage('START_STREAMING_VIDEO', {
        video: {
          title: newEntry.title,
          sizeStr: newEntry.sizeStr,
          durationSec: newEntry.durationSec,
        },
      });

      // 3. Start WebRTC P2P direct live stream (Instant zero-wait playback)
      setTimeout(() => {
        try {
          const stream = phoneVideo.captureStream ? phoneVideo.captureStream() : (phoneVideo.mozCaptureStream ? phoneVideo.mozCaptureStream() : null);
          if (stream) {
            startWebRtcSender(stream, file.name);
          }
        } catch (webrtcErr) {
          console.warn('WebRTC stream capture notice:', webrtcErr);
        }
      }, 300);

      // 4. In parallel: reliable chunked upload for permanent playback & seeking
      showToast(`Casting '${file.name}'`, 'Streaming to Laptop screen over Wi-Fi...');

      uploadFileInChunks(
        file,
        (percent, mbCurrent, mbTotal) => {
          if (standbyProgressWrap) {
            standbyProgressWrap.style.display = 'block';
            standbyProgressPercent.textContent = `${percent}%`;
            standbyProgressFill.style.width = `${percent}%`;
            standbyProgressLabel.textContent = `Streaming '${file.name}' (${mbCurrent}MB / ${mbTotal}MB)`;
          }
        },
        (firstChunkStreamUrl) => {
          // Play on Screen IMMEDIATELY from chunk 0! Zero wait!
          const fullStreamUrl = firstChunkStreamUrl.startsWith('http') ? firstChunkStreamUrl : `${getApiBaseUrl()}${firstChunkStreamUrl}`;
          newEntry.url = fullStreamUrl;
          broadcastMessage('SWITCH_VIDEO', { url: fullStreamUrl, title: newEntry.title, shouldAutoPlay: true, seekTime: 0 });
          showToast(`Now Streaming to Screen!`, `'${file.name}' playing live as data streams`);
        }
      ).then((streamUrl) => {
        const fullStreamUrl = streamUrl.startsWith('http') ? streamUrl : `${getApiBaseUrl()}${streamUrl}`;
        newEntry.url = fullStreamUrl;
        showToast(`Stream Ready on Laptop!`, `'${file.name}' playing in full quality`);
        broadcastMessage('NEW_VIDEO_AVAILABLE', { video: newEntry });
        broadcastMessage('SWITCH_VIDEO', { url: fullStreamUrl, title: newEntry.title, shouldAutoPlay: true, seekTime: 0 });
      }).catch((uploadErr) => {
        console.warn('Chunked upload fallback (playing live via WebRTC):', uploadErr);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Video Selection & Playback Coordination
  // ---------------------------------------------------------------------------
  function selectAndPlayVideo(index, shouldAutoPlay = true, seekTime = 0, isRemote = false) {
    if (index < 0 || index >= sharedGallery.length) {
      if (tvStandbyScreen && !tvVideo.srcObject) tvStandbyScreen.style.display = 'flex';
      return;
    }

    if (tvStandbyScreen) tvStandbyScreen.style.display = 'none';
    if (standbyProgressWrap) standbyProgressWrap.style.display = 'none';

    state.activeVideoIndex = index;
    const media = sharedGallery[index];

    phoneNowPlayingTitle.textContent = media.title;
    tvNowPlayingTitle.textContent = media.title;

    phoneVideo.src = media.url;
    phoneVideo.poster = media.thumb;
    phoneVideo.load();

    if (!isRemote) {
      tvVideo.src = media.url;
      tvVideo.poster = media.thumb;
      tvVideo.load();
    }

    if (seekTime > 0) {
      phoneVideo.currentTime = seekTime;
      tvVideo.currentTime = seekTime;
    }

    if (shouldAutoPlay) {
      state.isPlaying = true;
      phoneVideo.play().catch(() => {});
      const playPromise = tvVideo.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
          })
          .catch(() => {
            tvVideo.muted = true;
            state.isMutedOnTv = true;
            tvVideo.play().catch(() => {});
            if (tvPlayPrompt) tvPlayPrompt.classList.remove('prompt-hidden');
          });
      }
      updatePlayPauseIcons(true);
    } else {
      state.isPlaying = false;
      updatePlayPauseIcons(false);
    }

    renderGalleries();

    if (!isRemote) {
      broadcastMessage('SWITCH_VIDEO', { index, url: media.url, shouldAutoPlay, seekTime, title: media.title });
    }
  }

  function updatePlayPauseIcons(isPlaying) {
    state.isPlaying = isPlaying;
    if (isPlaying) {
      phonePlayPauseIcon.innerHTML = pauseSvg;
      phoneOverlayIcon.innerHTML = pauseSvg;
      phoneVideoOverlay.classList.add('overlay-hidden');
      if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
    } else {
      phonePlayPauseIcon.innerHTML = playSvg;
      phoneOverlayIcon.innerHTML = playSvg;
      phoneVideoOverlay.classList.remove('overlay-hidden');
    }
  }

  function togglePlayPause() {
    if (tvVideo.paused || tvVideo.ended) {
      tvVideo.play().catch(() => {});
      phoneVideo.play().catch(() => {});
      updatePlayPauseIcons(true);
      broadcastMessage('PLAY', { currentTime: tvVideo.currentTime || phoneVideo.currentTime });
    } else {
      tvVideo.pause();
      phoneVideo.pause();
      updatePlayPauseIcons(false);
      state.pausedHandoffTimestamp = tvVideo.currentTime || phoneVideo.currentTime;
      broadcastMessage('PAUSE', { currentTime: state.pausedHandoffTimestamp });
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Event Listeners: Phone & TV Video Sync
  // ---------------------------------------------------------------------------
  phoneBtnPlayPause.addEventListener('click', togglePlayPause);
  phoneOverlayPlayBtn.addEventListener('click', togglePlayPause);
  phoneVideoOverlay.addEventListener('click', togglePlayPause);

  if (tvPlayPrompt) {
    tvPlayPrompt.addEventListener('click', () => {
      tvVideo.muted = false;
      state.isMutedOnTv = false;
      if (phoneVolumeLabel) phoneVolumeLabel.textContent = 'TV Audio: ON';
      tvVideo
        .play()
        .then(() => {
          tvPlayPrompt.classList.add('prompt-hidden');
          updatePlayPauseIcons(true);
          showToast('Cinema Audio Active', 'Playing on TV screen with audio');
        })
        .catch((e) => console.warn(e));
    });
  }

  // Also clicking anywhere on the TV screen/video unmutes and plays audio
  if (tvVideo) {
    tvVideo.addEventListener('click', () => {
      if (tvVideo.muted || (tvPlayPrompt && !tvPlayPrompt.classList.contains('prompt-hidden'))) {
        tvVideo.muted = false;
        state.isMutedOnTv = false;
        if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
        tvVideo.play().catch(() => {});
        updatePlayPauseIcons(true);
        showToast('Audio Active', 'Audio unmuted on screen');
      }
    });
  }

  tvVideo.addEventListener('timeupdate', () => {
    const current = tvVideo.currentTime;
    const duration = tvVideo.duration || (sharedGallery[state.activeVideoIndex] ? sharedGallery[state.activeVideoIndex].durationSec : 1) || 1;
    const percent = Math.min(100, (current / duration) * 100);

    tvTimeCurrent.textContent = formatTime(current);
    tvTimeTotal.textContent = formatTime(duration);
    tvTimelineFill.style.width = `${percent}%`;
    tvTimelineMarker.style.left = `${percent}%`;

    phoneTimeCurrent.textContent = formatTime(current);
    phoneTimeDuration.textContent = formatTime(duration);
    phoneScrubberFill.style.width = `${percent}%`;
    phoneScrubberThumb.style.left = `${percent}%`;
  });

  tvVideo.addEventListener('pause', () => {
    updatePlayPauseIcons(false);
    state.pausedHandoffTimestamp = tvVideo.currentTime;
  });

  tvVideo.addEventListener('play', () => {
    updatePlayPauseIcons(true);
    if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
  });

  phoneScrubberTrack.addEventListener('click', (e) => {
    const rect = phoneScrubberTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    const duration = tvVideo.duration || phoneVideo.duration || 1;
    const seekTo = fraction * duration;

    tvVideo.currentTime = seekTo;
    phoneVideo.currentTime = seekTo;
    broadcastMessage('SEEK', { currentTime: seekTo });
  });

  phoneBtnSkipBack.addEventListener('click', () => {
    const seekTo = Math.max(0, (tvVideo.currentTime || phoneVideo.currentTime) - 10);
    tvVideo.currentTime = seekTo;
    phoneVideo.currentTime = seekTo;
    broadcastMessage('SEEK', { currentTime: seekTo });
  });

  phoneBtnSkipForward.addEventListener('click', () => {
    const seekTo = (tvVideo.currentTime || phoneVideo.currentTime) + 10;
    tvVideo.currentTime = seekTo;
    phoneVideo.currentTime = seekTo;
    broadcastMessage('SEEK', { currentTime: seekTo });
  });

  phoneBtnPrev.addEventListener('click', () => {
    if (sharedGallery.length <= 1) return;
    const newIdx = (state.activeVideoIndex - 1 + sharedGallery.length) % sharedGallery.length;
    selectAndPlayVideo(newIdx, true);
  });

  phoneBtnNext.addEventListener('click', () => {
    if (sharedGallery.length <= 1) return;
    const newIdx = (state.activeVideoIndex + 1) % sharedGallery.length;
    selectAndPlayVideo(newIdx, true);
  });

  btnPhoneStopHandoff.addEventListener('click', () => {
    tvVideo.pause();
    phoneVideo.pause();
    state.pausedHandoffTimestamp = tvVideo.currentTime || phoneVideo.currentTime;
    const formatted = formatTime(state.pausedHandoffTimestamp);

    modalPausedTimeSubtitle.textContent = `Paused at ${formatted} · Choose next action`;
    choiceTvTimestamp.textContent = `Continue streaming to ${state.targetDevice.name} from ${formatted}`;
    stopHandoffModal.classList.add('modal-open');
  });

  btnCloseStopHandoff.addEventListener('click', () => {
    stopHandoffModal.classList.remove('modal-open');
  });

  btnHandoffToTV.addEventListener('click', () => {
    stopHandoffModal.classList.remove('modal-open');
    tvVideo.currentTime = state.pausedHandoffTimestamp;
    phoneVideo.currentTime = state.pausedHandoffTimestamp;
    tvVideo.play().catch(() => {});
    phoneVideo.play().catch(() => {});
    showToast(`Streaming Resumed on TV`, `Continuing from ${formatTime(state.pausedHandoffTimestamp)}`);
  });

  btnOpenPhoneGalleryPicker.addEventListener('click', () => {
    stopHandoffModal.classList.remove('modal-open');
    triggerStoragePicker();
  });

  btnPhoneMuteToggle.addEventListener('click', () => {
    state.isMutedOnTv = !state.isMutedOnTv;
    tvVideo.muted = state.isMutedOnTv;
    phoneVolumeLabel.textContent = state.isMutedOnTv ? 'TV Audio: MUTED' : 'TV Audio: ON';
    showToast('TV Audio', state.isMutedOnTv ? 'Muted' : 'Unmuted');
  });

  // ---------------------------------------------------------------------------
  // 11. Target Device Selection Modal (TV Client Picker)
  // ---------------------------------------------------------------------------
  btnCastTargetSelector.addEventListener('click', () => {
    devicePickerModal.classList.add('modal-open');
  });

  btnCloseDevicePicker.addEventListener('click', () => {
    devicePickerModal.classList.remove('modal-open');
  });

  document.querySelectorAll('.peer-select-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.peer-select-card').forEach((c) => {
        c.classList.remove('selected-target');
        const badge = c.querySelector('.peer-check-badge');
        if (badge) badge.textContent = '';
      });

      card.classList.add('selected-target');
      const badge = card.querySelector('.peer-check-badge');
      if (badge) badge.textContent = '✓';

      state.targetDevice = {
        id: card.getAttribute('data-id'),
        name: card.getAttribute('data-name'),
        ip: card.getAttribute('data-ip'),
        type: card.getAttribute('data-type'),
        signal: '98%',
      };
    });
  });

  btnConfirmTargetDevice.addEventListener('click', () => {
    devicePickerModal.classList.remove('modal-open');
    selectedTargetDeviceName.textContent = state.targetDevice.name;
    tvSourceDeviceName.textContent = `Streaming to: ${state.targetDevice.name}`;
    updateServerIpDisplay();

    if (state.isPlaying) {
      showToast(
        `Connected to ${state.targetDevice.name}`,
        `Auto-streaming current video from ${formatTime(tvVideo.currentTime)}`
      );
    } else {
      showToast(
        `Connected to ${state.targetDevice.name}`,
        `Tap 'Choose Video & Cast' to stream a video from your gallery!`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 12. Cross-Device LAN Synchronization (SSE + BroadcastChannel + WebRTC)
  // ---------------------------------------------------------------------------
  function broadcastMessage(type, payload = {}) {
    if (castChannel) {
      castChannel.postMessage({
        type,
        payload,
        senderId: state.myClientId,
        senderName: state.deviceName,
        timestamp: Date.now(),
      });
    }

    fetch(`${getApiBaseUrl()}/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        payload,
        senderId: state.myClientId,
        senderName: state.deviceName,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }

  function handleIncomingEvent(type, payload, senderName) {
    if (type === 'START_STREAMING_VIDEO') {
      if (tvSourceDeviceName) {
        tvSourceDeviceName.textContent = `Connected to Phone: ${senderName || 'Mobile'}`;
      }
      if (standbyProgressWrap) {
        standbyProgressWrap.style.display = 'block';
        standbyProgressLabel.textContent = `Connecting stream: '${payload.video.title}'...`;
        standbyProgressPercent.textContent = 'Connecting';
        standbyProgressFill.style.width = '30%';
      }
    } else if (type === 'TRANSFER_PROGRESS') {
      if (standbyProgressWrap) {
        standbyProgressWrap.style.display = 'block';
        standbyProgressLabel.textContent = `Receiving '${payload.filename}' (${payload.mbCurrent}MB / ${payload.mbTotal}MB)`;
        standbyProgressPercent.textContent = `${payload.percent}%`;
        standbyProgressFill.style.width = `${payload.percent}%`;
      }
    } else if (type === 'WEBRTC_OFFER') {
      handleWebRtcOffer(payload.sdp, payload.title);
    } else if (type === 'WEBRTC_ANSWER') {
      handleWebRtcAnswer(payload.sdp);
    } else if (type === 'WEBRTC_ICE') {
      handleWebRtcIce(payload.candidate);
    } else if (type === 'SWITCH_VIDEO') {
      if (tvStandbyScreen) tvStandbyScreen.style.display = 'none';
      if (standbyProgressWrap) standbyProgressWrap.style.display = 'none';

      let targetUrl = payload.url;
      if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = `${getApiBaseUrl()}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
      }

      const videoTitle = payload.title || 'Video Stream';

      // Update Shared Gallery
      let entry = sharedGallery.find((v) => v.url === targetUrl || v.title === videoTitle);
      if (!entry) {
        entry = {
          id: `remote-${Date.now()}`,
          title: videoTitle,
          url: targetUrl,
          category: 'Transferred Video',
          sizeStr: 'Direct Stream',
          durationStr: '00:00',
          durationSec: 0,
          thumb: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&auto=format&fit=crop&q=80',
        };
        sharedGallery.unshift(entry);
        renderGalleries();
      }

      // 1. Play on TV screen
      tvVideo.srcObject = null;
      tvVideo.src = targetUrl;
      tvNowPlayingTitle.textContent = videoTitle;
      tvVideo.muted = false;
      state.isMutedOnTv = false;
      tvVideo.play().then(() => {
        if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
      }).catch(() => {
        tvVideo.muted = true;
        state.isMutedOnTv = true;
        tvVideo.play().catch(() => {});
        if (tvPlayPrompt) tvPlayPrompt.classList.remove('prompt-hidden');
      });

      // 2. Play on Phone screen too so Android device receives it!
      phoneVideo.src = targetUrl;
      phoneNowPlayingTitle.textContent = videoTitle;
      phoneVideo.play().catch(() => {});
      updatePlayPauseIcons(true);

      const phoneActiveBadge = document.getElementById('phoneActiveBadge');
      if (phoneActiveBadge) {
        phoneActiveBadge.textContent = '● Stream Active (From Laptop)';
      }

      showToast(`Now Playing: '${videoTitle}'`, 'Streamed across local network');

      if (tvSourceDeviceName) {
        tvSourceDeviceName.textContent = `Connected: ${senderName || 'Peer'} (${state.throughputSpeed})`;
      }
    } else if (type === 'PLAY') {
      if (tvVideo.src || tvVideo.srcObject) {
        tvVideo.play().catch(() => {});
      }
      if (phoneVideo.src) {
        phoneVideo.play().catch(() => {});
      }
      updatePlayPauseIcons(true);
      if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
    } else if (type === 'PAUSE') {
      tvVideo.pause();
      phoneVideo.pause();
      updatePlayPauseIcons(false);
      state.pausedHandoffTimestamp = payload.currentTime;
    } else if (type === 'SEEK') {
      if (tvVideo.src) {
        tvVideo.currentTime = payload.currentTime;
      }
      if (phoneVideo.src) {
        phoneVideo.currentTime = payload.currentTime;
      }
    } else if (type === 'NEW_VIDEO_AVAILABLE') {
      const v = payload.video;
      if (v && !sharedGallery.find((item) => item.id === v.id)) {
        sharedGallery.unshift(v);
        renderGalleries();
      }
    } else if (type === 'GALLERY_UPDATED') {
      renderGalleries();
    } else if (type === 'PEERS_UPDATED') {
      if (payload && payload.peers) {
        updateNearbyPeers(payload.peers);
      }
    } else if (type === 'AIRDROP_OFFER') {
      if (payload.toId && payload.toId !== state.myClientId) return;

      const fromId = payload.fromId;
      const fromName = payload.fromName || 'Nearby Peer';
      const video = payload.video;
      const isPaired = isPeerPaired(fromId);

      if (isPaired) {
        // "After the first connect" -> Auto-accept & immediately play on screen!
        savePairedPeer(fromId);
        adaptRole('receiver', { id: fromId, name: fromName }, video);
        broadcastMessage('AIRDROP_ACCEPT', {
          fromId: state.myClientId,
          fromName: state.deviceName,
          toId: fromId,
          video,
        });
        showToast(`AirDrop from ${fromName}`, `Auto-accepted & playing '${video.title}'`);
      } else {
        // First connect: show AirDrop sheet prompt!
        pendingAirDropOffer = payload;
        if (airDropSenderTitle) airDropSenderTitle.textContent = fromName;
        if (airDropFileName) airDropFileName.textContent = video.title;
        if (airDropFileSize) airDropFileSize.textContent = `${video.sizeStr} · Stream Ready`;
        if (airDropReceiveModal) airDropReceiveModal.classList.add('modal-open');
      }
    } else if (type === 'AIRDROP_ACCEPT') {
      if (payload.toId && payload.toId !== state.myClientId) return;
      savePairedPeer(payload.fromId);
      showToast('AirDrop Connected!', `${payload.fromName} accepted. Streaming video in sync.`);
    } else if (type === 'AIRDROP_PAIR_REQUEST') {
      if (payload.toId && payload.toId !== state.myClientId) return;
      savePairedPeer(payload.fromId);
      broadcastMessage('AIRDROP_PAIR_ACCEPT', {
        fromId: state.myClientId,
        fromName: state.deviceName,
        toId: payload.fromId,
      });
      showToast('Device Paired!', `Trusted '${payload.fromName}' for instant AirDrop sharing.`);
    } else if (type === 'AIRDROP_PAIR_ACCEPT') {
      if (payload.toId && payload.toId !== state.myClientId) return;
      savePairedPeer(payload.fromId);
      showToast('Device Paired!', `'${payload.fromName}' confirmed pairing.`);
    }
  }

  // ---------------------------------------------------------------------------
  // 12. AirDrop Movie Streams Engine & Server Gallery
  // ---------------------------------------------------------------------------
  function populateServerVideos(videos) {
    if (!videos || !videos.length) return;
    const base = getApiBaseUrl();
    const defaultThumb = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%230f172a"/><circle cx="200" cy="112" r="36" fill="%236366f1" opacity="0.4"/><polygon points="192,98 218,112 192,128" fill="%2338bdf8"/><text x="200" y="175" font-family="sans-serif" font-size="13" font-weight="bold" fill="%2394a3b8" text-anchor="middle">LocalDrop Cinema</text></svg>';

    // Filter valid files and prioritize web-ready MP4 (H.264 + AAC)
    const validVideos = videos
      .filter((v) => v.sizeBytes > 10000)
      .sort((a, b) => {
        const aIsMp4 = a.filename.toLowerCase().endsWith('.mp4');
        const bIsMp4 = b.filename.toLowerCase().endsWith('.mp4');
        if (aIsMp4 && !bIsMp4) return -1;
        if (!aIsMp4 && bIsMp4) return 1;
        return 0;
      });

    validVideos.forEach((v) => {
      const fullUrl = `${base}${v.streamUrl}`;
      if (!sharedGallery.some((item) => item.title === v.filename)) {
        sharedGallery.push({
          id: `srv-${v.filename}`,
          title: v.filename,
          category: v.category || 'Server Stream',
          durationStr: 'Stream Ready',
          durationSec: 0,
          sizeStr: v.sizeStr,
          url: fullUrl,
          thumb: defaultThumb,
          sourceType: 'server_stream',
        });
      }
    });
    renderGalleries();
  }

  function renderAirDropMovies(videos) {
    const airdropMovieGrid = document.getElementById('airdropMovieGrid');
    const airdropMediaCount = document.getElementById('airdropMediaCount');
    if (!airdropMovieGrid || !videos) return;

    // Filter valid files and prioritize web-ready MP4 (H.264 + AAC)
    const validVideos = videos
      .filter((v) => v.sizeBytes > 10000)
      .sort((a, b) => {
        const aIsMp4 = a.filename.toLowerCase().endsWith('.mp4');
        const bIsMp4 = b.filename.toLowerCase().endsWith('.mp4');
        if (aIsMp4 && !bIsMp4) return -1;
        if (!aIsMp4 && bIsMp4) return 1;
        return 0;
      });

    if (airdropMediaCount) {
      airdropMediaCount.textContent = `${validVideos.length} Streams Ready`;
    }

    airdropMovieGrid.innerHTML = '';
    validVideos.forEach((v) => {
      const fullStreamUrl = `${getApiBaseUrl()}${v.streamUrl}`;
      const isMobile = isMobileDevice;
      const targetLabel = isMobile ? 'AirDrop to Screen' : 'AirDrop to Phone';
      const isWebMp4 = v.filename.toLowerCase().endsWith('.mp4');

      const card = document.createElement('div');
      card.className = 'airdrop-movie-card';
      card.title = `Tap to AirDrop '${v.filename}' with instant playback`;
      card.innerHTML = `
        <div class="movie-card-info">
          <div class="movie-card-title" title="${v.filename}">🎬 ${v.filename}</div>
          <div class="movie-card-meta">
            <span class="movie-badge-cat">${v.category}</span>
            <span>·</span>
            <span>${v.sizeStr}</span>
            <span>·</span>
            ${isWebMp4 ? '<span style="color: #10b981; font-weight: 700;">⭐ Full Video & Audio</span>' : '<span style="color: #38bdf8; font-weight: 600;">⚡ LAN Stream</span>'}
          </div>
        </div>
        <button class="btn-movie-airdrop" title="Stream immediately to connected device">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>${targetLabel}</span>
        </button>
      `;

      const triggerAirDropStream = () => {
        const targetPeer = nearbyPeers[0] || state.targetDevice;
        showToast(`AirDrop Streaming!`, `Serving '${v.filename}' to ${targetPeer.name}`);

        // 1. Adapt local role to sender
        adaptRole('sender', targetPeer, { title: v.filename, url: fullStreamUrl });

        // 2. Broadcast AirDrop offer
        broadcastMessage('AIRDROP_OFFER', {
          fromId: state.myClientId,
          fromName: state.deviceName,
          fromType: isMobileDevice ? 'phone' : 'laptop',
          toId: targetPeer.id,
          video: {
            title: v.filename,
            url: fullStreamUrl,
            sizeStr: v.sizeStr
          }
        });

        // 3. Immediately switch video on target device (zero wait!)
        broadcastMessage('SWITCH_VIDEO', {
          url: fullStreamUrl,
          title: v.filename,
          shouldAutoPlay: true,
          seekTime: 0
        });
      };

      const btn = card.querySelector('.btn-movie-airdrop');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerAirDropStream();
      });

      card.addEventListener('click', triggerAirDropStream);

      airdropMovieGrid.appendChild(card);
    });
  }

  function renderLaptopLibrary(videos) {
    const laptopLibraryList = document.getElementById('laptopLibraryList');
    if (!laptopLibraryList || !videos) return;
    laptopLibraryList.innerHTML = '';
    videos.forEach((v) => {
      const card = document.createElement('div');
      card.style.cssText = 'background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px;';
      card.innerHTML = `
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
          <div style="font-weight: 600; color: #f1f5f9; font-size: 13px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${v.filename}">🎬 ${v.filename}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${v.category} · ${v.sizeStr}</div>
        </div>
        <button class="btn-send-to-phone" style="flex-shrink: 0; background: #0284c7; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          <span>AirDrop to Phone</span>
        </button>
      `;
      const btn = card.querySelector('.btn-send-to-phone');
      btn.addEventListener('click', () => {
        const fullStreamUrl = `${getApiBaseUrl()}${v.streamUrl}`;
        showToast(`AirDropping '${v.filename}'`, 'Streaming to Android Phone...');

        // Adapt sender role
        adaptRole('sender', state.targetDevice, { title: v.filename, url: fullStreamUrl });

        broadcastMessage('AIRDROP_OFFER', {
          fromId: state.myClientId,
          fromName: state.deviceName,
          fromType: isMobileDevice ? 'phone' : 'laptop',
          video: {
            title: v.filename,
            url: fullStreamUrl,
            sizeStr: v.sizeStr
          }
        });

        broadcastMessage('SWITCH_VIDEO', {
          url: fullStreamUrl,
          title: v.filename,
          shouldAutoPlay: true,
          seekTime: 0
        });
      });
      laptopLibraryList.appendChild(card);
    });
  }

  const btnPickLaptopVideo = document.getElementById('btnPickLaptopVideo');
  const laptopMediaFileInput = document.getElementById('laptopMediaFileInput');

  if (btnPickLaptopVideo && laptopMediaFileInput) {
    btnPickLaptopVideo.addEventListener('click', () => {
      laptopMediaFileInput.click();
    });

    laptopMediaFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast(`Transferring '${file.name}'`, 'Sending video from Laptop to Android Phone/Emulator...');
      uploadFileInChunks(file, (percent, mbCurrent, mbTotal) => {
        if (standbyProgressWrap) {
          standbyProgressWrap.style.display = 'block';
          standbyProgressLabel.textContent = `Streaming to Phone: '${file.name}' (${mbCurrent}MB / ${mbTotal}MB)`;
          standbyProgressPercent.textContent = `${percent}%`;
          standbyProgressFill.style.width = `${percent}%`;
        }
      }).then((streamUrl) => {
        const fullStreamUrl = streamUrl.startsWith('http') ? streamUrl : `${getApiBaseUrl()}${streamUrl}`;
        showToast('Transfer Complete!', `'${file.name}' beamed to Android Phone / Emulator`);
        broadcastMessage('SWITCH_VIDEO', {
          url: fullStreamUrl,
          title: file.name,
          shouldAutoPlay: true,
          seekTime: 0
        });
        tvVideo.src = fullStreamUrl;
        tvNowPlayingTitle.textContent = file.name;
        tvVideo.play().catch(() => {});
        phoneVideo.src = fullStreamUrl;
        phoneNowPlayingTitle.textContent = file.name;
        phoneVideo.play().catch(() => {});
      }).catch((err) => {
        showToast('Transfer Error', err.message);
      });
    });
  }

  if (castChannel) {
    castChannel.onmessage = (event) => {
      const { type, payload, senderId, senderName } = event.data;
      if (senderId === state.myClientId) return;
      handleIncomingEvent(type, payload, senderName);
    };
  }

  function initLanSync() {
    if (!window.EventSource) return;
    try {
      if (window.activeLanSse) {
        window.activeLanSse.close();
      }
      const sse = new EventSource(`${getApiBaseUrl()}/api/events`);
      window.activeLanSse = sse;
      sse.onopen = () => {
        console.log('⚡ Connected to LocalDrop LAN Broadcast Stream');
        if (state.currentMode === 'tv' && tvSourceDeviceName) {
          tvSourceDeviceName.textContent = 'LAN Connected · Ready for Phone Stream';
        }
      };
      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.senderId === state.myClientId) return;
          handleIncomingEvent(data.type, data.payload, data.senderName);
        } catch (e) {}
      };
    } catch (e) {
      console.warn('Failed to start EventSource LAN listener', e);
    }
  }

  // ---------------------------------------------------------------------------
  // 13. Initial Kickoff
  // ---------------------------------------------------------------------------
  renderGalleries();
  if (tvStandbyScreen) tvStandbyScreen.style.display = 'flex';
  discoverAndConnectServer();
});
