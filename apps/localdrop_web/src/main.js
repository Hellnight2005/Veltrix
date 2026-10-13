/**
 * LocalDrop Mobile Cinema & P2P Stream Handoff Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements - Video & Controls
  const mainVideo = document.getElementById('mainVideoPlayer');
  const receiverVideo = document.getElementById('receiverVideoPlayer');
  const videoWrapper = document.getElementById('videoWrapper');
  const overlayPlayBtn = document.getElementById('overlayPlayBtn');
  const videoOverlay = document.getElementById('videoOverlay');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const playPauseIcon = document.getElementById('playPauseIcon');
  const overlayPlayIcon = document.getElementById('overlayPlayIcon');
  const btnSkipBack = document.getElementById('btnSkipBack');
  const btnSkipForward = document.getElementById('btnSkipForward');
  const timeDisplay = document.getElementById('timeDisplay');
  const scrubberTrack = document.getElementById('scrubberTrack');
  const scrubberFill = document.getElementById('scrubberFill');
  const scrubberThumb = document.getElementById('scrubberThumb');
  const scrubberBuffered = document.getElementById('scrubberBuffered');
  const btnSpeedToggle = document.getElementById('btnSpeedToggle');
  const speedLabel = document.getElementById('speedLabel');
  const btnFullscreenToggle = document.getElementById('btnFullscreenToggle');
  const currentMovieTitle = document.getElementById('currentMovieTitle');
  const localVideoFileInput = document.getElementById('localVideoFileInput');
  const btnFilePickerTrigger = document.getElementById('btnFilePickerTrigger');
  const btnCustomFileClick = document.getElementById('btnCustomFileClick');

  // Elements - Handoff Drawer & Devices
  const handoffDrawer = document.getElementById('handoffDrawer');
  const btnCloseHandoffDrawer = document.getElementById('btnCloseHandoffDrawer');
  const handoffPausedTimeLabel = document.getElementById('handoffPausedTimeLabel');
  const actionSubTimestamp = document.getElementById('actionSubTimestamp');
  const btnDirectHandoff = document.getElementById('btnDirectHandoff');
  const devicePeersList = document.getElementById('devicePeersList');
  const btnExecuteStreamHandoff = document.getElementById('btnExecuteStreamHandoff');
  const btnExecuteFullTransfer = document.getElementById('btnExecuteFullTransfer');

  // Elements - Radar Modal & Fallback
  const btnOpenRadar = document.getElementById('btnOpenRadar');
  const radarModal = document.getElementById('radarModal');
  const btnCloseRadar = document.getElementById('btnCloseRadar');
  const btnScanNearbyBar = document.getElementById('btnScanNearbyBar');
  const btnRefreshDiscovery = document.getElementById('btnRefreshDiscovery');
  const btnConnectDirectIp = document.getElementById('btnConnectDirectIp');
  const directIpInput = document.getElementById('directIpInput');

  // Elements - Views & Frame
  const senderView = document.getElementById('senderView');
  const receiverView = document.getElementById('receiverView');
  const btnSwitchDeviceRole = document.getElementById('btnSwitchDeviceRole');
  const roleLabel = document.getElementById('roleLabel');
  const btnReturnToSender = document.getElementById('btnReturnToSender');
  const btnToggleMobileFrame = document.getElementById('btnToggleMobileFrame');
  const frameToggleLabel = document.getElementById('frameToggleLabel');
  const mobileDeviceShell = document.getElementById('mobileDeviceShell');

  // Elements - Receiver View Telemetry
  const receiverResumeStamp = document.getElementById('receiverResumeStamp');
  const receiverStreamStatusText = document.getElementById('receiverStreamStatusText');
  const telemetryThroughput = document.getElementById('telemetryThroughput');
  const telemetryChunks = document.getElementById('telemetryChunks');
  const telemetryHash = document.getElementById('telemetryHash');
  const streamProgressFill = document.getElementById('streamProgressFill');
  const streamProgressPercent = document.getElementById('streamProgressPercent');

  // Elements - Toast
  const transferToast = document.getElementById('transferToast');
  const toastTitle = document.getElementById('toastTitle');
  const toastDesc = document.getElementById('toastDesc');
  const toastActionBtn = document.getElementById('toastActionBtn');

  // Elements - Bottom Nav
  const navItemCinema = document.getElementById('navItemCinema');
  const navItemDevices = document.getElementById('navItemDevices');
  const navItemTransfers = document.getElementById('navItemTransfers');

  // Clock in status bar
  const statusClock = document.getElementById('statusClock');

  // App State
  let pausedTimestamp = 0;
  let isSeeking = false;
  let selectedTargetDevice = {
    id: 'tv-livingroom',
    name: 'Living Room Smart TV',
    ip: '192.168.1.105:8080',
    platform: 'android-tv',
  };
  let playbackSpeeds = [1.0, 1.25, 1.5, 2.0, 0.5, 0.75];
  let currentSpeedIndex = 0;
  let isReceiverMode = false;
  let isFramedMode = true;
  let activeTransferInterval = null;

  // Initialize clock
  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    if (statusClock) statusClock.textContent = `${hours}:${minutes}`;
  }
  updateClock();
  setInterval(updateClock, 30000);

  // Time formatter (seconds -> MM:SS)
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Icons SVG
  const playIconSvg = `<polygon points="5 3 19 12 5 21 5 3"/>`;
  const pauseIconSvg = `<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>`;

  // Toggle Video Play/Pause
  function togglePlayPause() {
    if (mainVideo.paused || mainVideo.ended) {
      mainVideo.play();
    } else {
      mainVideo.pause();
    }
  }

  // Update Play/Pause UI State
  function updatePlayPauseIcons(isPlaying) {
    if (isPlaying) {
      playPauseIcon.innerHTML = pauseIconSvg;
      overlayPlayIcon.innerHTML = pauseIconSvg;
      videoOverlay.classList.add('overlay-hidden');
    } else {
      playPauseIcon.innerHTML = playIconSvg;
      overlayPlayIcon.innerHTML = playIconSvg;
      videoOverlay.classList.remove('overlay-hidden');
    }
  }

  // Video Event Listeners
  mainVideo.addEventListener('play', () => {
    updatePlayPauseIcons(true);
  });

  mainVideo.addEventListener('pause', () => {
    updatePlayPauseIcons(false);
    pausedTimestamp = mainVideo.currentTime;

    // Trigger auto-prompt to transfer/continue stream!
    triggerHandoffPrompt(pausedTimestamp);
  });

  mainVideo.addEventListener('timeupdate', () => {
    if (!isSeeking && mainVideo.duration) {
      const current = mainVideo.currentTime;
      const duration = mainVideo.duration;
      const progressPercent = (current / duration) * 100;

      scrubberFill.style.width = `${progressPercent}%`;
      scrubberThumb.style.left = `${progressPercent}%`;
      timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    }
  });

  mainVideo.addEventListener('progress', () => {
    if (mainVideo.buffered.length > 0 && mainVideo.duration) {
      const bufferedEnd = mainVideo.buffered.end(mainVideo.buffered.length - 1);
      const bufferedPercent = (bufferedEnd / mainVideo.duration) * 100;
      scrubberBuffered.style.width = `${bufferedPercent}%`;
    }
  });

  mainVideo.addEventListener('loadedmetadata', () => {
    timeDisplay.textContent = `00:00 / ${formatTime(mainVideo.duration)}`;
  });

  // Scrubber Click & Seek
  scrubberTrack.addEventListener('click', (e) => {
    const rect = scrubberTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickFraction = Math.max(0, Math.min(1, clickX / rect.width));
    if (mainVideo.duration) {
      mainVideo.currentTime = clickFraction * mainVideo.duration;
    }
  });

  // Skip Buttons
  btnSkipBack.addEventListener('click', (e) => {
    e.stopPropagation();
    mainVideo.currentTime = Math.max(0, mainVideo.currentTime - 10);
  });

  btnSkipForward.addEventListener('click', (e) => {
    e.stopPropagation();
    mainVideo.currentTime = Math.min(mainVideo.duration || 0, mainVideo.currentTime + 10);
  });

  // Playback Speed Selector
  btnSpeedToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    currentSpeedIndex = (currentSpeedIndex + 1) % playbackSpeeds.length;
    const speed = playbackSpeeds[currentSpeedIndex];
    mainVideo.playbackRate = speed;
    speedLabel.textContent = `${speed}x`;
  });

  // Fullscreen Toggle
  btnFullscreenToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      videoWrapper.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  btnPlayPause.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlayPause();
  });

  videoOverlay.addEventListener('click', () => {
    togglePlayPause();
  });

  // Movie Library Selection
  document.querySelectorAll('.movie-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.movie-card').forEach(c => c.classList.remove('active-card'));
      card.classList.add('active-card');

      const videoUrl = card.getAttribute('data-video');
      const movieTitle = card.getAttribute('data-title');

      currentMovieTitle.textContent = movieTitle;
      mainVideo.src = videoUrl;
      mainVideo.load();
      mainVideo.play().catch(() => {});
    });
  });

  // Local File Upload / Picker
  function triggerLocalFilePicker() {
    localVideoFileInput.click();
  }

  btnFilePickerTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerLocalFilePicker();
  });

  btnCustomFileClick.addEventListener('click', () => {
    triggerLocalFilePicker();
  });

  localVideoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const fileUrl = URL.createObjectURL(file);
      currentMovieTitle.textContent = `${file.name} (Local Video)`;
      mainVideo.src = fileUrl;
      mainVideo.load();
      mainVideo.play().catch(() => {});

      showToast(`Loaded '${file.name}'`, 'Ready to stream over LocalDrop');
    }
  });

  // Auto-Handoff Trigger function
  function triggerHandoffPrompt(timestamp) {
    pausedTimestamp = timestamp;
    const formattedStamp = formatTime(timestamp);
    handoffPausedTimeLabel.textContent = `Stopped at ${formattedStamp} · Continue streaming on nearby device?`;
    actionSubTimestamp.textContent = `Resumes instantly from ${formattedStamp}`;
    handoffDrawer.classList.add('drawer-open');
  }

  btnDirectHandoff.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerHandoffPrompt(mainVideo.currentTime);
  });

  btnCloseHandoffDrawer.addEventListener('click', () => {
    handoffDrawer.classList.remove('drawer-open');
  });

  // Select Target Device in Drawer
  document.querySelectorAll('.peer-card-selectable').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.peer-card-selectable').forEach(c => {
        c.classList.remove('selected-peer');
        const check = c.querySelector('.radio-check');
        if (check) check.textContent = '';
      });

      card.classList.add('selected-peer');
      const check = card.querySelector('.radio-check');
      if (check) check.textContent = '✓';

      selectedTargetDevice = {
        id: card.getAttribute('data-device-id'),
        name: card.getAttribute('data-device-name'),
        ip: card.getAttribute('data-target-ip'),
        platform: card.getAttribute('data-platform'),
      };
    });
  });

  // Execute Stream Handoff: Hand off session and stream continuation
  btnExecuteStreamHandoff.addEventListener('click', () => {
    handoffDrawer.classList.remove('drawer-open');

    const movieName = currentMovieTitle.textContent;
    const formattedStamp = formatTime(pausedTimestamp);

    showToast(
      `Streaming to ${selectedTargetDevice.name}...`,
      `Handing off stream at ${formattedStamp} · 78.4 MB/s`
    );

    // Simulate stream transfer to receiver
    startStreamTelemetry(movieName, pausedTimestamp);

    // Auto-switch to receiver view so user can observe playback continuing smoothly
    setTimeout(() => {
      switchToReceiverView(pausedTimestamp);
    }, 1200);
  });

  // Execute Full File Transfer
  btnExecuteFullTransfer.addEventListener('click', () => {
    handoffDrawer.classList.remove('drawer-open');

    showToast(
      `Transferring 284 MB to ${selectedTargetDevice.name}...`,
      `LocalDrop TCP Engine · SHA-256 chunk validation active`
    );

    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        clearInterval(progressInterval);
        showToast(
          `Transfer Complete! (284 MB)`,
          `Verified SHA-256 integrity: 998fa39f...`
        );
      }
    }, 250);
  });

  // Switch to Receiver Mode & Resume Playback
  function switchToReceiverView(resumeAtSeconds) {
    isReceiverMode = true;
    senderView.classList.remove('active-view');
    receiverView.classList.add('active-view');
    roleLabel.textContent = 'Preview Phone Mode';

    // Update receiver status
    receiverResumeStamp.textContent = formatTime(resumeAtSeconds);
    receiverStreamStatusText.textContent = `Stream Active · Handed off to ${selectedTargetDevice.name}`;

    // Set receiver video source and seek to exact timestamp
    receiverVideo.src = mainVideo.currentSrc || mainVideo.src;
    receiverVideo.currentTime = resumeAtSeconds;
    receiverVideo.muted = true; // allow autoplay without user gesture restriction
    receiverVideo.play().catch(() => {});
  }

  function switchToSenderView() {
    isReceiverMode = false;
    receiverView.classList.remove('active-view');
    senderView.classList.add('active-view');
    roleLabel.textContent = 'Preview Receiver Mode';

    receiverVideo.pause();
  }

  btnSwitchDeviceRole.addEventListener('click', () => {
    if (isReceiverMode) {
      switchToSenderView();
    } else {
      switchToReceiverView(mainVideo.currentTime);
    }
  });

  btnReturnToSender.addEventListener('click', () => {
    switchToSenderView();
  });

  // Telemetry stream simulator
  function startStreamTelemetry(title, resumeSec) {
    let chunk = 12;
    const totalChunks = 284;
    clearInterval(activeTransferInterval);

    activeTransferInterval = setInterval(() => {
      chunk = Math.min(totalChunks, chunk + 6);
      const percent = Math.round((chunk / totalChunks) * 100);

      telemetryChunks.textContent = `${chunk} / ${totalChunks}`;
      streamProgressFill.style.width = `${percent}%`;
      streamProgressPercent.textContent = `${percent}%`;

      const speeds = [76.8, 79.2, 82.5, 74.3, 78.4];
      const speed = speeds[Math.floor(Math.random() * speeds.length)];
      telemetryThroughput.textContent = `${speed} MB/s`;

      if (chunk >= totalChunks) {
        clearInterval(activeTransferInterval);
      }
    }, 400);
  }

  // Toast Notification Helper
  function showToast(title, desc) {
    toastTitle.textContent = title;
    toastDesc.textContent = desc;
    transferToast.classList.add('toast-visible');

    setTimeout(() => {
      transferToast.classList.remove('toast-visible');
    }, 4500);
  }

  toastActionBtn.addEventListener('click', () => {
    switchToReceiverView(pausedTimestamp);
    transferToast.classList.remove('toast-visible');
  });

  // Radar Modal
  function openRadar() {
    radarModal.classList.add('modal-open');
  }

  function closeRadar() {
    radarModal.classList.remove('modal-open');
  }

  btnOpenRadar.addEventListener('click', openRadar);
  btnScanNearbyBar.addEventListener('click', openRadar);
  btnCloseRadar.addEventListener('click', closeRadar);
  btnRefreshDiscovery.addEventListener('click', () => {
    showToast('mDNS Browse Active', 'Refreshing _localdrop._tcp registry');
  });

  radarModal.addEventListener('click', (e) => {
    if (e.target === radarModal) closeRadar();
  });

  // Direct IP connect
  btnConnectDirectIp.addEventListener('click', () => {
    const ip = directIpInput.value.trim();
    if (ip) {
      closeRadar();
      showToast(`Connected to ${ip}`, 'Device paired and authenticated');
    }
  });

  // Frame Toggle (Phone Frame vs Fullscreen Responsive)
  btnToggleMobileFrame.addEventListener('click', () => {
    isFramedMode = !isFramedMode;
    if (isFramedMode) {
      mobileDeviceShell.classList.remove('unframed-mode');
      frameToggleLabel.textContent = 'Device Frame: ON';
    } else {
      mobileDeviceShell.classList.add('unframed-mode');
      frameToggleLabel.textContent = 'Device Frame: OFF';
    }
  });

  // Bottom Navigation Handling
  navItemCinema.addEventListener('click', () => {
    navItemCinema.classList.add('active-nav');
    navItemDevices.classList.remove('active-nav');
    navItemTransfers.classList.remove('active-nav');
    switchToSenderView();
  });

  navItemDevices.addEventListener('click', () => {
    navItemDevices.classList.add('active-nav');
    navItemCinema.classList.remove('active-nav');
    navItemTransfers.classList.remove('active-nav');
    openRadar();
  });

  navItemTransfers.addEventListener('click', () => {
    navItemTransfers.classList.add('active-nav');
    navItemCinema.classList.remove('active-nav');
    navItemDevices.classList.remove('active-nav');
    switchToReceiverView(mainVideo.currentTime);
  });
});
