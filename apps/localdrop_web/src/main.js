/**
 * LocalDrop Cast — Phone Media Server to TV Client Architecture
 * 
 * Features:
 * - Phone as Media Server & Remote Hub
 * - TV as Client Screen & Receiver
 * - Direct Gallery & Local File Access (Video, Audio, Photos)
 * - Auto-Handoff on Pause/Stop
 * - Shared Media Gallery on TV with Live Remote Switching
 * - Cross-device / Cross-tab synchronization via BroadcastChannel
 */

document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------------------------------------------------------
  // 1. Initial State & Shared Media Library
  // ---------------------------------------------------------------------------
  const state = {
    currentMode: 'dual', // 'phone' | 'tv' | 'dual'
    isFramedShell: true,
    targetDevice: {
      id: 'tv-livingroom',
      name: 'Living Room Smart TV',
      ip: '192.168.1.105:8080',
      type: 'tv',
      signal: '98%',
    },
    activeVideoIndex: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 734,
    isMutedOnTv: false,
    throughputSpeed: '78.4 MB/s',
    pausedHandoffTimestamp: 0,
  };

  // Shared Phone Media Gallery (Sample library + user picked local storage files)
  const sharedGallery = [
    {
      id: 'movie-1',
      title: 'Tears of Steel (4K Sci-Fi)',
      category: 'Sci-Fi Cinema',
      durationStr: '12:14',
      durationSec: 734,
      sizeStr: '284 MB · 1080p',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      thumb: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
      sourceType: 'phone_library',
    },
    {
      id: 'movie-2',
      title: 'Big Buck Bunny (4K Animation)',
      category: 'Animation',
      durationStr: '09:56',
      durationSec: 596,
      sizeStr: '410 MB · 4K 60fps',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumb: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
      sourceType: 'phone_library',
    },
    {
      id: 'movie-3',
      title: 'Sintel (Cinema Special Edition)',
      category: 'Fantasy Adventure',
      durationStr: '14:48',
      durationSec: 888,
      sizeStr: '520 MB · Spatial Audio',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      thumb: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      sourceType: 'phone_library',
    },
    {
      id: 'movie-4',
      title: 'Elephants Dream (Open Cinema)',
      category: 'Cyberpunk Cinema',
      durationStr: '10:53',
      durationSec: 653,
      sizeStr: '320 MB · HDR',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      thumb: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
      sourceType: 'phone_library',
    },
  ];

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
  const phoneActiveBadge = document.getElementById('phoneActiveBadge');
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
  const tvNowPlayingTitle = document.getElementById('tvNowPlayingTitle');
  const tvSourceDeviceName = document.getElementById('tvSourceDeviceName');
  const tvSpeedChip = document.getElementById('tvSpeedChip');
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

  // Broadcast Channel for real-time cross-tab / cross-device messaging
  const castChannel = window.BroadcastChannel ? new BroadcastChannel('localdrop_cast_sync') : null;

  // ---------------------------------------------------------------------------
  // 3. Helper Functions
  // ---------------------------------------------------------------------------
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function showToast(title, desc) {
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

  // SVG Icons
  const playSvg = `<polygon points="5 3 19 12 5 21 5 3"/>`;
  const pauseSvg = `<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>`;

  // ---------------------------------------------------------------------------
  // 4. View Mode Switcher (Phone, TV, Dual)
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

  // URL query parameter support (e.g. ?mode=tv or ?mode=phone)
  const urlParams = new URLSearchParams(window.location.search);
  const initialMode = urlParams.get('mode') || 'dual';
  applyViewMode(initialMode);

  btnModePhone.addEventListener('click', () => applyViewMode('phone'));
  btnModeTV.addEventListener('click', () => applyViewMode('tv'));
  btnModeDual.addEventListener('click', () => applyViewMode('dual'));

  // Mobile Shell toggle
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
  // 5. Gallery Rendering: Phone List & TV Carousel
  // ---------------------------------------------------------------------------
  function renderGalleries() {
    // 1. Render on Phone
    phoneGalleryList.innerHTML = '';
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
      });

      phoneGalleryList.appendChild(card);
    });

    // 2. Render on TV
    tvCardsCarousel.innerHTML = '';
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

  // ---------------------------------------------------------------------------
  // 6. Media File Picker & Direct Phone Storage Access
  // ---------------------------------------------------------------------------
  function triggerStoragePicker() {
    phoneMediaFileInput.click();
  }

  btnPickGalleryDirect.addEventListener('click', triggerStoragePicker);
  btnUploadMoreGallery.addEventListener('click', triggerStoragePicker);

  phoneMediaFileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    files.forEach((file) => {
      const fileUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video');

      // Create a new gallery entry
      const newEntry = {
        id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        title: file.name,
        category: 'Phone Storage / Gallery',
        durationStr: '00:00',
        durationSec: 0,
        sizeStr: `${(file.size / (1024 * 1024)).toFixed(1)} MB · ${file.type || 'Media'}`,
        url: fileUrl,
        thumb: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&auto=format&fit=crop&q=80',
        sourceType: 'user_storage',
      };

      // Extract real duration and canvas thumbnail snapshot if video
      if (isVideo) {
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = fileUrl;
        tempVideo.addEventListener('loadedmetadata', () => {
          newEntry.durationSec = Math.round(tempVideo.duration);
          newEntry.durationStr = formatTime(tempVideo.duration);
          renderGalleries();
        });
      }

      sharedGallery.unshift(newEntry);
    });

    renderGalleries();
    showToast(`Added ${files.length} Video(s) from Phone Storage`, 'Now accessible on Living Room TV!');

    // Broadcast updated gallery to all connected TV clients
    broadcastMessage('GALLERY_UPDATED', { count: sharedGallery.length });
  });

  // ---------------------------------------------------------------------------
  // 7. Video Selection & Playback Coordination
  // ---------------------------------------------------------------------------
  function selectAndPlayVideo(index, shouldAutoPlay = true, seekTime = 0) {
    if (index < 0 || index >= sharedGallery.length) return;

    state.activeVideoIndex = index;
    const media = sharedGallery[index];

    // Update Titles
    phoneNowPlayingTitle.textContent = media.title;
    tvNowPlayingTitle.textContent = media.title;

    // Load Sources
    phoneVideo.src = media.url;
    tvVideo.src = media.url;

    phoneVideo.load();
    tvVideo.load();

    if (seekTime > 0) {
      phoneVideo.currentTime = seekTime;
      tvVideo.currentTime = seekTime;
    }

    if (shouldAutoPlay) {
      state.isPlaying = true;
      phoneVideo.play().catch(() => {});
      tvVideo.play().catch(() => {});
      updatePlayPauseIcons(true);
    } else {
      state.isPlaying = false;
      updatePlayPauseIcons(false);
    }

    renderGalleries();
    broadcastMessage('SWITCH_VIDEO', { index, shouldAutoPlay, seekTime });
  }

  function updatePlayPauseIcons(isPlaying) {
    state.isPlaying = isPlaying;
    if (isPlaying) {
      phonePlayPauseIcon.innerHTML = pauseSvg;
      phoneOverlayIcon.innerHTML = pauseSvg;
      phoneVideoOverlay.classList.add('overlay-hidden');
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
      broadcastMessage('PLAY', { currentTime: tvVideo.currentTime });
    } else {
      tvVideo.pause();
      phoneVideo.pause();
      updatePlayPauseIcons(false);
      state.pausedHandoffTimestamp = tvVideo.currentTime;
      broadcastMessage('PAUSE', { currentTime: tvVideo.currentTime });
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Event Listeners: Phone & TV Video Sync
  // ---------------------------------------------------------------------------
  phoneBtnPlayPause.addEventListener('click', togglePlayPause);
  phoneOverlayPlayBtn.addEventListener('click', togglePlayPause);
  phoneVideoOverlay.addEventListener('click', togglePlayPause);

  // Time Updates (TV is master screen)
  tvVideo.addEventListener('timeupdate', () => {
    const current = tvVideo.currentTime;
    const duration = tvVideo.duration || sharedGallery[state.activeVideoIndex].durationSec || 1;
    const percent = Math.min(100, (current / duration) * 100);

    // Update TV HUD
    tvTimeCurrent.textContent = formatTime(current);
    tvTimeTotal.textContent = formatTime(duration);
    tvTimelineFill.style.width = `${percent}%`;
    tvTimelineMarker.style.left = `${percent}%`;

    // Update Phone Controller
    phoneTimeCurrent.textContent = formatTime(current);
    phoneTimeDuration.textContent = formatTime(duration);
    phoneScrubberFill.style.width = `${percent}%`;
    phoneScrubberThumb.style.left = `${percent}%`;
  });

  // Pause / Stop Auto-Handoff Trigger
  tvVideo.addEventListener('pause', () => {
    updatePlayPauseIcons(false);
    state.pausedHandoffTimestamp = tvVideo.currentTime;
  });

  tvVideo.addEventListener('play', () => {
    updatePlayPauseIcons(true);
  });

  // Phone Scrubber Click & Seek
  phoneScrubberTrack.addEventListener('click', (e) => {
    const rect = phoneScrubberTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    const duration = tvVideo.duration || sharedGallery[state.activeVideoIndex].durationSec || 1;
    const seekTo = fraction * duration;

    tvVideo.currentTime = seekTo;
    phoneVideo.currentTime = seekTo;
    broadcastMessage('SEEK', { currentTime: seekTo });
  });

  // Skip & Next/Prev Controls
  phoneBtnSkipBack.addEventListener('click', () => {
    const seekTo = Math.max(0, tvVideo.currentTime - 10);
    tvVideo.currentTime = seekTo;
    phoneVideo.currentTime = seekTo;
    broadcastMessage('SEEK', { currentTime: seekTo });
  });

  phoneBtnSkipForward.addEventListener('click', () => {
    const seekTo = Math.min(tvVideo.duration || 9999, tvVideo.currentTime + 10);
    tvVideo.currentTime = seekTo;
    phoneVideo.currentTime = seekTo;
    broadcastMessage('SEEK', { currentTime: seekTo });
  });

  phoneBtnPrev.addEventListener('click', () => {
    const newIdx = (state.activeVideoIndex - 1 + sharedGallery.length) % sharedGallery.length;
    selectAndPlayVideo(newIdx, true);
  });

  phoneBtnNext.addEventListener('click', () => {
    const newIdx = (state.activeVideoIndex + 1) % sharedGallery.length;
    selectAndPlayVideo(newIdx, true);
  });

  // Stop & Switch Device Button -> Opens Handoff Modal
  btnPhoneStopHandoff.addEventListener('click', () => {
    tvVideo.pause();
    phoneVideo.pause();
    state.pausedHandoffTimestamp = tvVideo.currentTime;
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

  // Mute / Audio Toggle on TV
  btnPhoneMuteToggle.addEventListener('click', () => {
    state.isMutedOnTv = !state.isMutedOnTv;
    tvVideo.muted = state.isMutedOnTv;
    phoneVolumeLabel.textContent = state.isMutedOnTv ? 'TV Audio: MUTED' : 'TV Audio: ON';
    showToast('TV Audio', state.isMutedOnTv ? 'Muted' : 'Unmuted');
  });

  // ---------------------------------------------------------------------------
  // 9. Target Device Selection Modal (TV Client Picker)
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
    tvSourceDeviceName.textContent = `Connected to Phone: Pixel 9 Pro (192.168.1.54) -> ${state.targetDevice.name}`;

    // Workflow Check: Is video already playing?
    if (state.isPlaying) {
      showToast(
        `Connected to ${state.targetDevice.name}`,
        `Auto-streaming current video from ${formatTime(tvVideo.currentTime)}`
      );
    } else {
      showToast(
        `Connected to ${state.targetDevice.name}`,
        `Pick any video from your phone gallery to start streaming on TV!`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 10. Cross-Device / Cross-Window Broadcast Synchronization
  // ---------------------------------------------------------------------------
  function broadcastMessage(type, payload = {}) {
    if (castChannel) {
      castChannel.postMessage({ type, payload, timestamp: Date.now() });
    }
  }

  if (castChannel) {
    castChannel.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === 'SWITCH_VIDEO') {
        if (payload.index !== state.activeVideoIndex) {
          selectAndPlayVideo(payload.index, payload.shouldAutoPlay, payload.seekTime);
        }
      } else if (type === 'PLAY') {
        tvVideo.currentTime = payload.currentTime;
        tvVideo.play().catch(() => {});
        updatePlayPauseIcons(true);
      } else if (type === 'PAUSE') {
        tvVideo.pause();
        updatePlayPauseIcons(false);
      } else if (type === 'SEEK') {
        tvVideo.currentTime = payload.currentTime;
      } else if (type === 'GALLERY_UPDATED') {
        renderGalleries();
      }
    };
  }

  // ---------------------------------------------------------------------------
  // 11. Initial Kickoff
  // ---------------------------------------------------------------------------
  renderGalleries();
  selectAndPlayVideo(0, false, 0);
});
