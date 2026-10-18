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

  // Continuous Playback State & Resume Memory (Continues from exact frame across device switches)
  function saveResumeProgress(title, currentTime, duration) {
    if (!title || isNaN(currentTime) || currentTime < 1) return;
    try {
      const cache = JSON.parse(localStorage.getItem('localdrop_resume_cache') || '{}');
      cache[title] = {
        currentTime: Math.floor(currentTime),
        duration: Math.floor(duration || 0),
        updatedAt: Date.now(),
      };
      localStorage.setItem('localdrop_resume_cache', JSON.stringify(cache));
    } catch (e) {}
  }

  function getResumeProgress(title) {
    if (!title) return 0;
    try {
      const cache = JSON.parse(localStorage.getItem('localdrop_resume_cache') || '{}');
      const entry = cache[title];
      if (entry && entry.currentTime) {
        if (!entry.duration || entry.currentTime < entry.duration - 5) {
          return entry.currentTime;
        }
      }
    } catch (e) {}
    return 0;
  }

  function updateMovieResumeBadge(title, currentTime) {
    if (!title || !currentTime) return;
    const cards = document.querySelectorAll('.airdrop-movie-card');
    cards.forEach((card) => {
      const titleEl = card.querySelector('.movie-card-title');
      if (titleEl && (titleEl.getAttribute('title') === title || titleEl.textContent.includes(title))) {
        let badge = card.querySelector('.movie-badge-resume');
        const btn = card.querySelector('.btn-movie-airdrop span');
        if (!badge && currentTime > 1) {
          badge = document.createElement('span');
          badge.className = 'movie-badge-resume';
          badge.style.cssText = 'color: #fbbf24; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); padding: 2px 7px; border-radius: 999px; font-weight: 700; font-size: 10.5px;';
          const meta = card.querySelector('.movie-card-meta');
          if (meta) meta.appendChild(badge);
        }
        if (badge) {
          badge.textContent = `⏱️ Resume at ${formatTime(currentTime)}`;
        }
        if (btn && currentTime > 1) {
          btn.textContent = `⚡ Resume (${formatTime(currentTime)})`;
        }
      }
    });
  }

  function playWithFrameResume(videoEl, url, seekTime, videoTitle) {
    if (!videoEl || !url) return;

    let targetUrl = url;
    if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('blob:') && !targetUrl.startsWith('data:')) {
      targetUrl = `${getApiBaseUrl()}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    const title = videoTitle || (videoEl === tvVideo ? tvNowPlayingTitle?.textContent : phoneNowPlayingTitle?.textContent) || '';
    const resumeTime = (seekTime !== undefined && seekTime > 0)
      ? seekTime
      : getResumeProgress(title);

    const applySeek = () => {
      if (resumeTime > 0 && Math.abs(videoEl.currentTime - resumeTime) > 0.5) {
        try {
          videoEl.currentTime = resumeTime;
        } catch (err) {
          console.warn('Seek error:', err);
        }
      }

      videoEl.muted = false;
      videoEl.volume = 1.0;
      state.isMutedOnTv = false;
      if (phoneVolumeLabel) phoneVolumeLabel.textContent = 'TV Audio: ON';

      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
          })
          .catch((err) => {
            console.warn('Autoplay unmuted blocked by policy, trying muted with prompt:', err);
            videoEl.muted = true;
            state.isMutedOnTv = true;
            if (phoneVolumeLabel) phoneVolumeLabel.textContent = 'TV Audio: MUTED';
            videoEl.play().catch(() => {});
            if (videoEl === tvVideo && tvPlayPrompt) {
              tvPlayPrompt.classList.remove('prompt-hidden');
            }
          });
      }
    };

    videoEl.removeAttribute('poster');
    videoEl.poster = '';
    if (tvStandbyScreen) tvStandbyScreen.style.display = 'none';

    // Dynamically match subtitle tracks with active episode
    let epNum = '11';
    if (title.includes('12')) epNum = '12';
    else if (title.includes('13')) epNum = '13';

    const trackEng = videoEl.querySelector('track[label="English Subtitles"]');
    const trackSigns = videoEl.querySelector('track[label="Signs & Songs"]');
    if (trackEng) trackEng.src = `/api/stream/Episode_${epNum}_Subtitles_Eng.vtt`;
    if (trackSigns) trackSigns.src = `/api/stream/Episode_${epNum}_Subtitles_Signs.vtt`;

    if (videoEl.src === targetUrl || (videoEl.currentSrc && videoEl.currentSrc === targetUrl)) {
      applySeek();
    } else {
      videoEl.srcObject = null;
      videoEl.src = targetUrl;
      videoEl.load();

      if (videoEl.readyState >= 1) {
        applySeek();
      } else {
        videoEl.addEventListener('loadedmetadata', applySeek, { once: true });
      }
    }
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
  const tvTimelineTrack = document.getElementById('tvTimelineTrack');
  const tvTimelineBuffered = document.getElementById('tvTimelineBuffered');
  const tvCardsCarousel = document.getElementById('tvCardsCarousel');
  const tvGalleryCountTag = document.getElementById('tvGalleryCountTag');
  const tvClockDisplay = document.getElementById('tvClockDisplay');
  const statusClock = document.getElementById('statusClock');

  // TV Native On-Screen Cinema Controls
  const tvBtnPlayPause = document.getElementById('tvBtnPlayPause');
  const tvPlayPauseIcon = document.getElementById('tvPlayPauseIcon');
  const tvBtnPrev = document.getElementById('tvBtnPrev');
  const tvBtnNext = document.getElementById('tvBtnNext');
  const tvBtnSkipBack = document.getElementById('tvBtnSkipBack');
  const tvBtnSkipForward = document.getElementById('tvBtnSkipForward');
  const tvBtnStop = document.getElementById('tvBtnStop');
  const tvBtnMute = document.getElementById('tvBtnMute');
  const tvMuteIcon = document.getElementById('tvMuteIcon');
  const tvVolumeSlider = document.getElementById('tvVolumeSlider');
  const tvVolumeLabel = document.getElementById('tvVolumeLabel');
  const tvSubtitleSelect = document.getElementById('tvSubtitleSelect');
  const tvSubFileInput = document.getElementById('tvSubFileInput');
  const tvBtnFullscreen = document.getElementById('tvBtnFullscreen');
  const tvBtnTopFullscreen = document.getElementById('tvBtnTopFullscreen');

  // Phone Subtitles & Fullscreen Controls
  const phoneSubtitleSelect = document.getElementById('phoneSubtitleSelect');
  const phoneSubFileInput = document.getElementById('phoneSubFileInput');
  const phoneBtnFullscreen = document.getElementById('phoneBtnFullscreen');

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
  sendHeartbeat();
  setInterval(sendHeartbeat, 3000);

  function updateNearbyPeers(peersList) {
    nearbyPeers = peersList.filter((p) => p.id !== state.myClientId);
    renderNearbyPeers();
  }

  function getCurrentActiveVideo() {
    if (state.activeVideoIndex >= 0 && sharedGallery[state.activeVideoIndex]) {
      return sharedGallery[state.activeVideoIndex];
    }
    const currentTitle = (tvNowPlayingTitle && tvNowPlayingTitle.textContent) || (phoneNowPlayingTitle && phoneNowPlayingTitle.textContent);
    const currentSrc = tvVideo.src || phoneVideo.src;
    if (currentSrc && currentTitle && currentTitle !== 'Ready to Stream' && currentTitle !== 'No Video Selected') {
      return { url: currentSrc, title: currentTitle };
    }
    return sharedGallery[0] || null;
  }

  function handoffStreamToPeer(targetPeer) {
    const activeVideo = getCurrentActiveVideo();
    if (!activeVideo || !activeVideo.url) {
      state.targetDevice = targetPeer;
      showToast(`Selected ${targetPeer.name}`, `Choose any movie below to stream to this device.`);
      const airdropSection = document.getElementById('airdropMediaServerSection');
      if (airdropSection) airdropSection.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // Exact frame timestamp
    const currentSeconds = Math.floor(tvVideo.currentTime || phoneVideo.currentTime || getResumeProgress(activeVideo.title) || 0);

    saveResumeProgress(activeVideo.title, currentSeconds, tvVideo.duration || phoneVideo.duration);

    showToast(`Switching to ${targetPeer.name}!`, `Continuing stream from ${formatTime(currentSeconds)} (0-wait)`);

    // Broadcast instant switch with exact seekTime
    broadcastMessage('SWITCH_VIDEO', {
      url: activeVideo.url,
      title: activeVideo.title,
      seekTime: currentSeconds,
      shouldAutoPlay: true,
      targetPeerId: targetPeer.id,
      fromDevice: state.deviceName,
    });

    // Also send AirDrop offer
    broadcastMessage('AIRDROP_OFFER', {
      fromId: state.myClientId,
      fromName: state.deviceName,
      fromType: isMobileDevice ? 'phone' : 'laptop',
      toId: targetPeer.id,
      video: {
        title: activeVideo.title,
        url: activeVideo.url,
        seekTime: currentSeconds,
      }
    });

    adaptRole('sender', targetPeer, { title: activeVideo.title, url: activeVideo.url, seekTime: currentSeconds });
  }

  function renderHandoffChips() {
    const containers = [
      document.getElementById('handoffDeviceChips'),
      document.getElementById('phoneHandoffDeviceChips')
    ];

    containers.forEach((container) => {
      if (!container) return;
      container.innerHTML = '';

      if (nearbyPeers.length === 0) {
        container.innerHTML = `<span style="font-size: 11px; color: #64748b; font-weight: 500;">Searching nearby Wi-Fi devices...</span>`;
        return;
      }

      nearbyPeers.forEach((peer) => {
        const btn = document.createElement('button');
        btn.className = 'handoff-chip-btn';
        btn.innerHTML = `
          <span>${peer.type === 'phone' ? '📱' : '💻'}</span>
          <span>${peer.name}</span>
          <span style="opacity: 0.8; font-size: 10px; background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 999px;">⚡ Switch</span>
        `;
        btn.title = `Switch screen to ${peer.name} and resume from current frame instantly`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handoffStreamToPeer(peer);
        });
        container.appendChild(btn);
      });
    });
  }

  function renderNearbyPeers() {
    renderHandoffChips();
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
      card.title = isPaired ? `Paired with ${peer.name}. Tap to stream/handoff video!` : `Tap to pair and stream with ${peer.name}`;
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
          <span>${isPaired ? 'AirDrop Stream' : 'Pair & Stream'}</span>
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

        handoffStreamToPeer(peer);
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
    if (streamUrl && !streamUrl.startsWith('http://') && !streamUrl.startsWith('https://') && !streamUrl.startsWith('blob:') && !streamUrl.startsWith('data:')) {
      streamUrl = `${getApiBaseUrl()}${streamUrl.startsWith('/') ? '' : '/'}${streamUrl}`;
    }

    const seekTime = (video && video.seekTime !== undefined && video.seekTime > 0)
      ? video.seekTime
      : getResumeProgress(video.title);

    // Always hide standby screen when any video is initiated
    if (tvStandbyScreen) tvStandbyScreen.style.display = 'none';
    if (standbyProgressWrap) standbyProgressWrap.style.display = 'none';

    if (role === 'receiver') {
      applyViewMode('tv');
      tvNowPlayingTitle.textContent = video.title;
      if (tvSourceDeviceName) {
        tvSourceDeviceName.textContent = `AirDrop Stream from: ${peer.name} · Direct LAN`;
      }

      playWithFrameResume(tvVideo, streamUrl, seekTime, video.title);
      updatePlayPauseIcons(true);
      showToast(`AirDrop Connected`, `Now playing '${video.title}' from ${peer.name}${seekTime > 0 ? ' (Resumed at ' + formatTime(seekTime) + ')' : ''}`);
    } else if (role === 'sender') {
      applyViewMode(isMobileDevice ? 'phone' : 'dual');
      phoneNowPlayingTitle.textContent = video.title;

      // When phone is sending/casting to TV or Laptop:
      // Pause local playback on phone to prevent duplicate audio and frame collision!
      if (isMobileDevice) {
        phoneVideo.pause();
        const phoneActiveBadge = document.getElementById('phoneActiveBadge');
        if (phoneActiveBadge) {
          phoneActiveBadge.textContent = `📺 Streaming to ${peer.name} · Remote Active`;
        }
      } else {
        // Laptop screen serving to phone or TV
        tvNowPlayingTitle.textContent = video.title;
        if (tvSourceDeviceName) {
          tvSourceDeviceName.textContent = `Serving to: ${peer.name} · Direct LAN`;
        }
        playWithFrameResume(tvVideo, streamUrl, seekTime, video.title);
      }

      updatePlayPauseIcons(true);
      showToast(`AirDrop Active`, `Serving '${video.title}' to ${peer.name}${seekTime > 0 ? ' (Resumed at ' + formatTime(seekTime) + ')' : ''}`);
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

    const resumeTime = (seekTime > 0) ? seekTime : getResumeProgress(media.title);

    const isTvActive = (state.currentMode === 'tv' || !isMobileDevice);
    if (isTvActive) {
      playWithFrameResume(tvVideo, media.url, resumeTime, media.title);
      if (isMobileDevice) {
        phoneVideo.pause();
      }
    } else {
      // Mobile device in Phone mode:
      // If streaming to TV/Laptop (or remote peer selected), pause local playback on phone!
      if (!isRemote) {
        phoneVideo.pause();
        const phoneActiveBadge = document.getElementById('phoneActiveBadge');
        if (phoneActiveBadge) {
          phoneActiveBadge.textContent = `📺 Streaming to ${state.targetDevice?.name || 'Screen'} · Remote Active`;
        }
      } else {
        playWithFrameResume(phoneVideo, media.url, resumeTime, media.title);
      }
    }

    state.isPlaying = shouldAutoPlay;
    updatePlayPauseIcons(shouldAutoPlay);

    renderGalleries();

    if (!isRemote) {
      broadcastMessage('SWITCH_VIDEO', { 
        index, 
        url: media.url, 
        shouldAutoPlay, 
        seekTime: resumeTime, 
        title: media.title,
        fromDevice: state.deviceName 
      });
    }
  }

  function updatePlayPauseIcons(isPlaying) {
    state.isPlaying = isPlaying;
    if (isPlaying) {
      if (phonePlayPauseIcon) phonePlayPauseIcon.innerHTML = pauseSvg;
      if (phoneOverlayIcon) phoneOverlayIcon.innerHTML = pauseSvg;
      if (tvPlayPauseIcon) tvPlayPauseIcon.innerHTML = pauseSvg;
      if (phoneVideoOverlay) phoneVideoOverlay.classList.add('overlay-hidden');
      if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
    } else {
      if (phonePlayPauseIcon) phonePlayPauseIcon.innerHTML = playSvg;
      if (phoneOverlayIcon) phoneOverlayIcon.innerHTML = playSvg;
      if (tvPlayPauseIcon) tvPlayPauseIcon.innerHTML = playSvg;
      if (phoneVideoOverlay) phoneVideoOverlay.classList.remove('overlay-hidden');
    }
  }

  function togglePlayPause() {
    const isTvActive = (state.currentMode === 'tv' || !isMobileDevice);
    const targetEl = isTvActive ? tvVideo : phoneVideo;
    if (targetEl.paused || targetEl.ended) {
      targetEl.play().catch(() => {});
      updatePlayPauseIcons(true);
      broadcastMessage('PLAY', { currentTime: targetEl.currentTime });
    } else {
      targetEl.pause();
      updatePlayPauseIcons(false);
      state.pausedHandoffTimestamp = targetEl.currentTime;
      broadcastMessage('PAUSE', { currentTime: state.pausedHandoffTimestamp });
    }
  }

  // Subtitle track switcher for HTML5 <video> textTracks
  function applySubtitleSelection(videoEl, trackChoice) {
    if (!videoEl || !videoEl.textTracks) return;
    const tracks = videoEl.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const label = (track.label || '').toLowerCase();
      const lang = (track.language || '').toLowerCase();
      
      if (trackChoice === 'off') {
        track.mode = 'disabled';
      } else if (trackChoice === 'eng') {
        if (label.includes('english') || label.includes('eng') || lang === 'en' || (i === 0 && !label.includes('signs'))) {
          track.mode = 'showing';
        } else {
          track.mode = 'disabled';
        }
      } else if (trackChoice === 'signs') {
        if (label.includes('sign') || label.includes('song')) {
          track.mode = 'showing';
        } else {
          track.mode = 'disabled';
        }
      } else if (trackChoice === 'custom') {
        if (label.includes('custom')) {
          track.mode = 'showing';
        } else {
          track.mode = 'disabled';
        }
      }
    }
  }

  function loadCustomSubtitleFile(file, videoEl, selectEl) {
    if (!file || !videoEl) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      let content = e.target.result;
      if (file.name.endsWith('.srt')) {
        content = 'WEBVTT\n\n' + content
          .replace(/\r\n|\r/g, '\n')
          .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }
      const blob = new Blob([content], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);
      
      const existing = videoEl.querySelector('track[label="Custom Subtitles"]');
      if (existing) existing.remove();

      const newTrack = document.createElement('track');
      newTrack.kind = 'subtitles';
      newTrack.label = 'Custom Subtitles';
      newTrack.srclang = 'custom';
      newTrack.src = url;
      newTrack.default = true;
      videoEl.appendChild(newTrack);

      setTimeout(() => {
        applySubtitleSelection(videoEl, 'custom');
        if (selectEl) selectEl.value = 'custom';
        showToast('Subtitles Loaded', `Loaded '${file.name}'`);
      }, 100);
    };
    reader.readAsText(file);
  }

  function toggleFullscreen(targetEl) {
    const el = targetEl || document.querySelector('.tv-player-viewport') || tvVideo;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  function updateTvMuteIcon(isMuted) {
    if (!tvMuteIcon) return;
    if (isMuted) {
      tvMuteIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="1" y1="1" y2="23"/>`;
    } else {
      tvMuteIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`;
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Event Listeners: Phone & TV Video Sync & Audio Activation
  // ---------------------------------------------------------------------------
  function ensureAudioUnmuted() {
    if (tvVideo) {
      tvVideo.muted = false;
      tvVideo.volume = 1.0;
      state.isMutedOnTv = false;
      if (phoneVolumeLabel) phoneVolumeLabel.textContent = 'TV Audio: ON';
      if (tvVolumeLabel) tvVolumeLabel.textContent = '100%';
      if (tvVolumeSlider) tvVolumeSlider.value = 100;
      updateTvMuteIcon(false);
      if (tvPlayPrompt) tvPlayPrompt.classList.add('prompt-hidden');
    }
    if (phoneVideo) {
      phoneVideo.muted = false;
      phoneVideo.volume = 1.0;
    }
  }

  // Any user click/touch anywhere enables audio output
  document.addEventListener('click', ensureAudioUnmuted, { passive: true });
  document.addEventListener('touchstart', ensureAudioUnmuted, { passive: true });

  phoneBtnPlayPause.addEventListener('click', () => {
    ensureAudioUnmuted();
    togglePlayPause();
  });
  phoneOverlayPlayBtn.addEventListener('click', () => {
    ensureAudioUnmuted();
    togglePlayPause();
  });
  phoneVideoOverlay.addEventListener('click', () => {
    ensureAudioUnmuted();
    togglePlayPause();
  });

  if (phoneVideo) {
    phoneVideo.addEventListener('click', () => {
      ensureAudioUnmuted();
      if (phoneVideo.paused) {
        phoneVideo.play().catch(() => {});
      }
    });
  }

  if (tvPlayPrompt) {
    tvPlayPrompt.addEventListener('click', () => {
      ensureAudioUnmuted();
      tvVideo.play().catch((e) => console.warn(e));
      updatePlayPauseIcons(true);
      showToast('Cinema Audio Active', 'Playing on TV screen with audio');
    });
  }

  // Also clicking anywhere on the TV screen/video unmutes and plays audio
  if (tvVideo) {
    tvVideo.addEventListener('click', () => {
      ensureAudioUnmuted();
      if (tvVideo.paused) {
        tvVideo.play().catch(() => {});
        updatePlayPauseIcons(true);
      }
      showToast('Audio Active', 'Audio unmuted on screen');
    });
  }

  let lastBroadcastSec = 0;

  function handleVideoTimeUpdate(videoEl) {
    if (!videoEl) return;
    const current = videoEl.currentTime;
    const duration = videoEl.duration || (sharedGallery[state.activeVideoIndex] ? sharedGallery[state.activeVideoIndex].durationSec : 1) || 1;
    const percent = Math.min(100, (current / duration) * 100);

    tvTimeCurrent.textContent = formatTime(current);
    tvTimeTotal.textContent = formatTime(duration);
    tvTimelineFill.style.width = `${percent}%`;
    tvTimelineMarker.style.left = `${percent}%`;

    // Buffer range display for HTTP 206 chunked stream
    if (videoEl.buffered && videoEl.buffered.length > 0) {
      try {
        const bufferedEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
        const buffPercent = Math.min(100, (bufferedEnd / duration) * 100);
        if (tvTimelineBuffered) tvTimelineBuffered.style.width = `${buffPercent}%`;
      } catch (e) {}
    }

    phoneTimeCurrent.textContent = formatTime(current);
    phoneTimeDuration.textContent = formatTime(duration);
    phoneScrubberFill.style.width = `${percent}%`;
    phoneScrubberThumb.style.left = `${percent}%`;

    const title = (tvNowPlayingTitle && tvNowPlayingTitle.textContent) || (phoneNowPlayingTitle && phoneNowPlayingTitle.textContent);
    if (title && title !== 'Ready to Stream' && title !== 'No Video Selected' && current > 1) {
      saveResumeProgress(title, current, duration);
      updateMovieResumeBadge(title, current);

      const curSec = Math.floor(current);
      if (curSec % 3 === 0 && curSec !== lastBroadcastSec) {
        lastBroadcastSec = curSec;
        broadcastMessage('SYNC_PROGRESS', {
          title,
          currentTime: curSec,
          duration: Math.floor(duration),
        });
      }
    }
  }

  tvVideo.addEventListener('timeupdate', () => handleVideoTimeUpdate(tvVideo));
  phoneVideo.addEventListener('timeupdate', () => handleVideoTimeUpdate(phoneVideo));

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
  // 10.1 TV On-Screen Cinema Controls (Interactive on TV & Laptop Screen)
  // ---------------------------------------------------------------------------
  if (tvTimelineTrack) {
    tvTimelineTrack.addEventListener('click', (e) => {
      const rect = tvTimelineTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, clickX / rect.width));
      const duration = tvVideo.duration || 1;
      const seekTo = fraction * duration;
      tvVideo.currentTime = seekTo;
      broadcastMessage('SEEK', { currentTime: seekTo });
      showToast('Seeked', formatTime(seekTo));
    });
  }

  if (tvBtnPlayPause) {
    tvBtnPlayPause.addEventListener('click', () => {
      ensureAudioUnmuted();
      togglePlayPause();
    });
  }

  if (tvBtnSkipBack) {
    tvBtnSkipBack.addEventListener('click', () => {
      const seekTo = Math.max(0, tvVideo.currentTime - 10);
      tvVideo.currentTime = seekTo;
      broadcastMessage('SEEK', { currentTime: seekTo });
    });
  }

  if (tvBtnSkipForward) {
    tvBtnSkipForward.addEventListener('click', () => {
      const seekTo = Math.min(tvVideo.duration || 9999, tvVideo.currentTime + 10);
      tvVideo.currentTime = seekTo;
      broadcastMessage('SEEK', { currentTime: seekTo });
    });
  }

  if (tvBtnPrev) {
    tvBtnPrev.addEventListener('click', () => {
      if (sharedGallery.length <= 1) return;
      const newIdx = (state.activeVideoIndex - 1 + sharedGallery.length) % sharedGallery.length;
      selectAndPlayVideo(newIdx, true);
    });
  }

  if (tvBtnNext) {
    tvBtnNext.addEventListener('click', () => {
      if (sharedGallery.length <= 1) return;
      const newIdx = (state.activeVideoIndex + 1) % sharedGallery.length;
      selectAndPlayVideo(newIdx, true);
    });
  }

  if (tvBtnStop) {
    tvBtnStop.addEventListener('click', () => {
      tvVideo.pause();
      tvVideo.currentTime = 0;
      if (tvStandbyScreen) tvStandbyScreen.style.display = 'flex';
      updatePlayPauseIcons(false);
      broadcastMessage('PAUSE', { currentTime: 0 });
      showToast('Playback Stopped', 'TV Screen in Standby');
    });
  }

  if (tvVolumeSlider) {
    tvVolumeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      tvVideo.volume = val / 100;
      tvVideo.muted = (val === 0);
      if (tvVolumeLabel) tvVolumeLabel.textContent = `${val}%`;
      updateTvMuteIcon(val === 0);
    });
  }

  if (tvBtnMute) {
    tvBtnMute.addEventListener('click', () => {
      tvVideo.muted = !tvVideo.muted;
      if (tvVideo.muted) {
        if (tvVolumeLabel) tvVolumeLabel.textContent = 'Muted';
        updateTvMuteIcon(true);
      } else {
        if (tvVideo.volume === 0) tvVideo.volume = 1.0;
        if (tvVolumeSlider) tvVolumeSlider.value = Math.round(tvVideo.volume * 100);
        if (tvVolumeLabel) tvVolumeLabel.textContent = `${tvVolumeSlider.value}%`;
        updateTvMuteIcon(false);
      }
      showToast('TV Audio', tvVideo.muted ? 'Muted' : 'Unmuted');
    });
  }

  if (tvSubtitleSelect) {
    tvSubtitleSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        if (tvSubFileInput) tvSubFileInput.click();
      } else {
        applySubtitleSelection(tvVideo, val);
        showToast('Subtitles', e.target.options[e.target.selectedIndex].text);
      }
    });
  }

  if (tvSubFileInput) {
    tvSubFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        loadCustomSubtitleFile(e.target.files[0], tvVideo, tvSubtitleSelect);
      }
    });
  }

  if (tvBtnFullscreen) {
    tvBtnFullscreen.addEventListener('click', () => {
      toggleFullscreen(document.querySelector('.tv-player-viewport'));
    });
  }

  if (tvBtnTopFullscreen) {
    tvBtnTopFullscreen.addEventListener('click', () => {
      toggleFullscreen(document.querySelector('.tv-player-viewport'));
    });
  }

  // ---------------------------------------------------------------------------
  // 10.2 Phone Subtitles & Fullscreen Event Listeners
  // ---------------------------------------------------------------------------
  if (phoneSubtitleSelect) {
    phoneSubtitleSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        if (phoneSubFileInput) phoneSubFileInput.click();
      } else {
        applySubtitleSelection(phoneVideo, val);
        showToast('Phone Subtitles', e.target.options[e.target.selectedIndex].text);
      }
    });
  }

  if (phoneSubFileInput) {
    phoneSubFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        loadCustomSubtitleFile(e.target.files[0], phoneVideo, phoneSubtitleSelect);
      }
    });
  }

  if (phoneBtnFullscreen) {
    phoneBtnFullscreen.addEventListener('click', () => {
      toggleFullscreen(phoneVideo);
    });
  }

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
      if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('blob:') && !targetUrl.startsWith('data:')) {
        targetUrl = `${getApiBaseUrl()}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
      }

      const videoTitle = payload.title || 'Video Stream';
      const resumeTime = (payload.seekTime !== undefined && payload.seekTime > 0)
        ? payload.seekTime
        : getResumeProgress(videoTitle);

      // Update Shared Gallery
      let entry = sharedGallery.find((v) => v.url === targetUrl || v.title === videoTitle);
      if (!entry) {
        entry = {
          id: `remote-${Date.now()}`,
          title: videoTitle,
          url: targetUrl,
          category: 'AirDrop Stream',
          sizeStr: 'Direct LAN',
          durationStr: '00:00',
          durationSec: 0,
          thumb: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&auto=format&fit=crop&q=80',
        };
        sharedGallery.unshift(entry);
        renderGalleries();
      }

      // 1. Play on TV screen if on TV/Laptop screen
      if (state.currentMode === 'tv' || !isMobileDevice) {
        tvNowPlayingTitle.textContent = videoTitle;
        playWithFrameResume(tvVideo, targetUrl, resumeTime, videoTitle);
        updatePlayPauseIcons(true);
      }

      // 2. Play on Phone screen if Phone is receiver (not originator)
      if (isMobileDevice) {
        phoneNowPlayingTitle.textContent = videoTitle;
        const phoneActiveBadge = document.getElementById('phoneActiveBadge');

        if (payload.fromDevice === state.deviceName || payload.fromId === state.myClientId) {
          // Phone was the sender! Pause local video so audio doesn't clash with TV screen
          phoneVideo.pause();
          if (phoneActiveBadge) {
            phoneActiveBadge.textContent = `📺 Streaming to TV Screen · Remote Active`;
          }
        } else {
          // Phone is receiving the stream!
          playWithFrameResume(phoneVideo, targetUrl, resumeTime, videoTitle);
          if (phoneActiveBadge) {
            phoneActiveBadge.textContent = '● Stream Active (From Laptop)';
          }
        }
        updatePlayPauseIcons(true);
      }

      showToast(
        `Now Playing: '${videoTitle}'`,
        resumeTime > 0 ? `Resumed from ${formatTime(resumeTime)} (0-wait)` : 'Streamed across local network'
      );

      if (tvSourceDeviceName) {
        tvSourceDeviceName.textContent = `Connected: ${senderName || 'Peer'} (${state.throughputSpeed})`;
      }
    } else if (type === 'SYNC_PROGRESS') {
      if (payload && payload.title) {
        saveResumeProgress(payload.title, payload.currentTime, payload.duration);
        updateMovieResumeBadge(payload.title, payload.currentTime);
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
      const resumeTime = getResumeProgress(v.filename);
      const isResumable = resumeTime > 0;

      const card = document.createElement('div');
      card.className = 'airdrop-movie-card';
      card.title = isResumable ? `Resume '${v.filename}' from ${formatTime(resumeTime)}` : `Tap to AirDrop '${v.filename}' with instant playback`;
      card.innerHTML = `
        <div class="movie-card-info">
          <div class="movie-card-title" title="${v.filename}">🎬 ${v.filename}</div>
          <div class="movie-card-meta">
            <span class="movie-badge-cat">${v.category}</span>
            <span>·</span>
            <span>${v.sizeStr}</span>
            <span>·</span>
            ${isWebMp4 ? '<span style="color: #10b981; font-weight: 700;">⭐ Full Video & Audio</span>' : '<span style="color: #38bdf8; font-weight: 600;">⚡ LAN Stream</span>'}
            ${isResumable ? `<span class="movie-badge-resume" style="color: #fbbf24; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); padding: 2px 7px; border-radius: 999px; font-weight: 700; font-size: 10.5px;">⏱️ Resume at ${formatTime(resumeTime)}</span>` : ''}
          </div>
        </div>
        <button class="btn-movie-airdrop" title="Stream immediately to connected device">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>${isResumable ? `⚡ Resume (${formatTime(resumeTime)})` : targetLabel}</span>
        </button>
      `;

      const triggerAirDropStream = () => {
        const targetPeer = nearbyPeers[0] || state.targetDevice;
        const currentResumeSec = getResumeProgress(v.filename);
        showToast(`AirDrop Streaming!`, `Serving '${v.filename}' to ${targetPeer.name}${currentResumeSec > 0 ? ' (from ' + formatTime(currentResumeSec) + ')' : ''}`);

        // 1. Adapt local role to sender
        adaptRole('sender', targetPeer, { title: v.filename, url: fullStreamUrl, seekTime: currentResumeSec });

        // 2. Broadcast AirDrop offer
        broadcastMessage('AIRDROP_OFFER', {
          fromId: state.myClientId,
          fromName: state.deviceName,
          fromType: isMobileDevice ? 'phone' : 'laptop',
          toId: targetPeer.id,
          video: {
            title: v.filename,
            url: fullStreamUrl,
            sizeStr: v.sizeStr,
            seekTime: currentResumeSec
          }
        });

        // 3. Immediately switch video on target device (zero wait!)
        broadcastMessage('SWITCH_VIDEO', {
          url: fullStreamUrl,
          title: v.filename,
          shouldAutoPlay: true,
          seekTime: currentResumeSec,
          targetPeerId: targetPeer.id,
          fromDevice: state.deviceName
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
      const resumeTime = getResumeProgress(v.filename);
      const isResumable = resumeTime > 0;
      const card = document.createElement('div');
      card.style.cssText = 'background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px;';
      card.innerHTML = `
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
          <div style="font-weight: 600; color: #f1f5f9; font-size: 13px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${v.filename}">🎬 ${v.filename}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
            ${v.category} · ${v.sizeStr}
            ${isResumable ? ` · <span style="color: #fbbf24; font-weight: 700;">⏱️ ${formatTime(resumeTime)}</span>` : ''}
          </div>
        </div>
        <button class="btn-send-to-phone" style="flex-shrink: 0; background: #0284c7; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          <span>${isResumable ? `Resume (${formatTime(resumeTime)})` : 'AirDrop to Phone'}</span>
        </button>
      `;
      const btn = card.querySelector('.btn-send-to-phone');
      btn.addEventListener('click', () => {
        const fullStreamUrl = `${getApiBaseUrl()}${v.streamUrl}`;
        const currentResumeSec = getResumeProgress(v.filename);
        showToast(`AirDropping '${v.filename}'`, 'Streaming to Android Phone...');

        // Adapt sender role
        adaptRole('sender', state.targetDevice, { title: v.filename, url: fullStreamUrl, seekTime: currentResumeSec });

        broadcastMessage('AIRDROP_OFFER', {
          fromId: state.myClientId,
          fromName: state.deviceName,
          fromType: isMobileDevice ? 'phone' : 'laptop',
          video: {
            title: v.filename,
            url: fullStreamUrl,
            sizeStr: v.sizeStr,
            seekTime: currentResumeSec
          }
        });

        broadcastMessage('SWITCH_VIDEO', {
          url: fullStreamUrl,
          title: v.filename,
          shouldAutoPlay: true,
          seekTime: currentResumeSec
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
