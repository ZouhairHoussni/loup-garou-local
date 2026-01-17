/**
 * Loup-Garou TV - Immersive Game Master Interface
 * Features:
 * - Sequential death announcements
 * - Game configuration (timers, roles)
 * - Medieval theme with animations
 * - Enhanced vote visualization
 */

document.addEventListener('DOMContentLoaded', init);

function init() {
  console.log('[TV] === GAME MASTER UI STARTING ===');
  
  const $ = id => document.getElementById(id);
  
  // Parse URL for backend
  const params = new URLSearchParams(window.location.search);
  const host = params.get('backendHost') || window.location.hostname;
  const port = params.get('backendPort') || window.location.port || '8000';
  const portPart = port ? `:${port}` : '';
  
  const API_URL = `${window.location.protocol}//${host}${portPart}`;
  const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${host}${portPart}`;
  
  console.log('[TV] API:', API_URL);
  
  // Store the real IP for QR code (will be fetched from server)
  let realIP = null;
  
  // Fetch real IP from server
  async function fetchRealIP() {
    try {
      const res = await fetch(API_URL + '/api/server-info');
      const data = await res.json();
      if (data.ip) {
        realIP = data.ip;
        console.log('[TV] Server IP:', realIP);
      }
    } catch (e) {
      console.warn('[TV] Could not fetch server IP, using hostname');
    }
  }
  
  // Call on init
  fetchRealIP();
  
  // Game state
  let state = {
    phase: 'LOBBY',
    night_count: 0,
    day_count: 0,
    alive: [],
    dead: [],
    started: false,
    winner: null,
    timers: null
  };
  
  let ws = null;
  let currentScreen = 'screenLobby';
  let lastPhase = 'LOBBY';
  let deathQueue = [];
  let deathIndex = 0;
  let previousAliveIds = [];
  
  // Configuration (can be modified before game starts)
  let config = {
    nightAction: 22,
    dayDiscuss: 15,
    voteTime: 25,
    resultTime: 5
  };
  
  // FX
  const fx = window.LGFX?.init($('fxCanvas'), { mode: 'night' });
  
  // ============ HELPERS ============
  function getRoleImage(role) {
    const images = {
      villager: 'villager.jpg',
      werewolf: 'werewolf.jpg',
      seer: 'voyante.jpg',
      witch: 'sorcerer.jpg',
      cupid: 'cupidon.jpg',
      hunter: 'hunter.jpg'
    };
    return '/static/cards/' + (images[role] || 'verso.jpg');
  }
  
  function getRoleName(role) {
    const names = {
      villager: 'Villageois',
      werewolf: 'Loup-Garou',
      seer: 'Voyante',
      witch: 'Sorcière',
      cupid: 'Cupidon',
      hunter: 'Chasseur'
    };
    return names[role] || '???';
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
  
  // ============ SCREENS ============
  const allScreens = [
    'screenLobby', 'screenNight', 'screenDawn', 
    'screenDay', 'screenVote', 'screenExecution', 'screenGameOver'
  ];
  
  function showScreen(screenId, animate = true) {
    console.log('[TV] Showing screen:', screenId);
    
    allScreens.forEach(id => {
      const el = $(id);
      if (el) {
        if (id === screenId) {
          el.style.display = 'flex';
          if (animate) {
            el.style.opacity = '0';
            setTimeout(() => { el.style.opacity = '1'; }, 50);
          }
          el.classList.add('active');
        } else {
          el.classList.remove('active');
          el.style.display = 'none';
        }
      }
    });
    
    currentScreen = screenId;
    
    // Update app theme
    const app = $('app');
    if (app) {
      app.classList.toggle('day-mode', 
        screenId === 'screenDay' || 
        screenId === 'screenVote' || 
        screenId === 'screenExecution'
      );
    }
    
    fx?.burst({ kind: 'magic', count: 15 });
  }
  
  // ============ CONNECTION ============
  function connect() {
    const url = `${WS_URL}/ws?client=tv`;
    console.log('[TV] Connecting:', url);
    
    ws = new WebSocket(url);
    
    ws.onopen = () => {
      console.log('[TV] Connected');
      setConnected(true);
      fx?.burst({ kind: 'magic', count: 20 });
    };
    
    ws.onclose = () => {
      console.log('[TV] Disconnected');
      setConnected(false);
      setTimeout(connect, 1500);
    };
    
    ws.onerror = (e) => {
      console.error('[TV] WebSocket error:', e);
      setConnected(false);
    };
    
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleMessage(msg);
      } catch (err) {
        console.error('[TV] Parse error:', err);
      }
    };
  }
  
  function setConnected(connected) {
    const status = $('connStatus');
    if (status) {
      status.classList.toggle('connected', connected);
      status.querySelector('.status-text').textContent = connected ? 'Connecté' : 'Déconnecté';
    }
  }
  
  // ============ MESSAGE HANDLING ============
  function handleMessage(msg) {
    console.log('[TV] Message:', msg.type);
    
    switch (msg.type) {
      case 'PUBLIC_STATE':
        handlePublicState(msg.data);
        break;
        
      case 'NARRATOR_LINE':
        appendNarrator(msg.line);
        break;
        
      case 'VOTE_STATUS':
        updateVoteProgress(msg);
        break;
        
      case 'VOTE_RESULT':
        showExecution(msg);
        break;
        
      case 'GAME_OVER':
        state.winner = msg.winner;
        state.winner_fr = msg.winner_fr;
        showGameOver();
        break;
        
      case 'RESET':
        location.reload();
        break;
    }
  }
  
  function handlePublicState(data) {
    const oldPhase = state.phase;
    const oldAliveIds = state.alive.map(p => p.id);
    
    // Update state
    state.phase = data.phase;
    state.night_count = data.night_count || 0;
    state.day_count = data.day_count || 0;
    state.alive = data.alive || [];
    state.dead = data.dead || [];
    state.started = data.started;
    state.winner = data.winner;
    state.timers = data.timers;
    
    // Detect new deaths
    const newAliveIds = state.alive.map(p => p.id);
    const justDied = oldAliveIds.filter(id => !newAliveIds.includes(id));
    
    if (justDied.length > 0 && oldPhase !== 'LOBBY') {
      // Queue deaths for announcement
      const newDeaths = state.dead.filter(p => justDied.includes(p.id));
      if (newDeaths.length > 0) {
        deathQueue = newDeaths;
        deathIndex = 0;
      }
    }
    
    previousAliveIds = newAliveIds;
    
    // Update UI based on phase
    updateUI(oldPhase !== state.phase);
  }
  
  // ============ UI UPDATE ============
  function updateUI(phaseChanged) {
    // Always update graveyard and timer
    updateGraveyard();
    updateTimer();
    
    // Phase-specific updates
    if (state.phase === 'LOBBY') {
      if (phaseChanged) showScreen('screenLobby');
      updateLobby();
    } else if (state.phase === 'NIGHT') {
      if (phaseChanged) {
        showScreen('screenNight');
        fx?.setMode('night');
      }
      updateNight();
    } else if (state.phase === 'DAY') {
      if (phaseChanged) {
        // Show dawn with death reveals first
        if (deathQueue.length > 0) {
          showDawnSequence();
        } else {
          showScreen('screenDawn');
          $('deathTheater').style.display = 'none';
          $('noDeath').style.display = 'block';
          setTimeout(() => showScreen('screenDay'), 3000);
        }
        fx?.setMode('day');
      }
      updateDay();
    } else if (state.phase === 'VOTE') {
      if (phaseChanged) {
        showScreen('screenVote');
        buildVoteArena();
      }
      updateVote();
    } else if (state.phase === 'GAME_OVER') {
      if (phaseChanged) showGameOver();
    }
    
    lastPhase = state.phase;
  }
  
  function updateTimer() {
    const timers = {
      'nightTimer': state.timers?.seconds_left,
      'dayTimer': state.timers?.seconds_left,
      'voteTimer': state.timers?.seconds_left
    };
    
    Object.entries(timers).forEach(([id, value]) => {
      const el = $(id);
      if (el) {
        el.textContent = value != null ? `${value}s` : '--';
        el.parentElement?.classList.toggle('urgent', value != null && value <= 5);
      }
    });
  }
  
  // ============ LOBBY ============
  function updateLobby() {
    // Player count and start button
    const countEl = $('playerCount');
    const countBtn = $('playerCountBtn');
    const hintEl = $('startHint');
    const playerCount = state.alive.length;
    
    if (countEl) countEl.textContent = playerCount;
    
    // Update button state based on player count
    if (countBtn) {
      const canStart = playerCount >= 5;
      countBtn.classList.toggle('ready', canStart);
      
      if (hintEl) {
        if (canStart) {
          hintEl.textContent = '▶ COMMENCER';
        } else {
          hintEl.textContent = `${5 - playerCount} de plus requis`;
        }
      }
    }
    
    // Players in circle
    const ring = $('playersRing');
    if (ring) {
      const players = state.alive;
      const n = players.length;
      const radius = 130;
      
      ring.innerHTML = players.map((p, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const x = 160 + radius * Math.cos(angle);
        const y = 160 + radius * Math.sin(angle);
        
        return `
          <div class="player-token" style="left:${x}px;top:${y}px;">
            <div class="avatar">${(p.name || '?')[0].toUpperCase()}</div>
            <div class="name">${escapeHtml(p.name)}</div>
          </div>
        `;
      }).join('');
    }
    
    // Join URL and QR Code - use real IP if available
    const joinUrl = $('joinUrl');
    const qrCanvas = $('qrCanvas');
    
    // Use real IP for QR code, fallback to current host
    const qrHost = realIP || host;
    const playerUrl = `http://${qrHost}${portPart}/player/`;
    
    if (joinUrl) {
      joinUrl.textContent = playerUrl;
    }
    
    // Generate QR code (only once, or regenerate if IP changed)
    if (qrCanvas && (!qrCanvas.dataset.generated || qrCanvas.dataset.ip !== qrHost)) {
      qrCanvas.dataset.generated = 'true';
      qrCanvas.dataset.ip = qrHost;
      generateQRCode(qrCanvas, playerUrl);
    }
  }
  
  // QR Code generation with medieval parchment style
  function generateQRCode(canvas, url) {
    try {
      if (typeof QRCode !== 'undefined') {
        // Clear any existing QR code
        const parent = canvas.parentElement;
        const existingImg = parent.querySelector('img');
        if (existingImg) existingImg.remove();
        
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        
        new QRCode(parent, {
          text: url,
          width: 80,
          height: 80,
          colorDark: "#2a1f14",   // Dark brown
          colorLight: "#f0e0c8",  // Parchment
          correctLevel: QRCode.CorrectLevel.M
        });
        
        canvas.style.display = 'none';
      }
    } catch (e) {
      console.warn('[TV] QR generation failed:', e);
    }
  }
  
  // ============ NIGHT ============
  function updateNight() {
    // Night number
    const nightNum = $('nightNumber');
    if (nightNum) nightNum.textContent = state.night_count;
    
    // Sleeping players
    const village = $('sleepingVillage');
    if (village) {
      village.innerHTML = state.alive.map(p => `
        <div class="sleeping-player">
          <div class="avatar">
            ${(p.name || '?')[0].toUpperCase()}
            <span class="zzz">💤</span>
          </div>
          <div class="name">${escapeHtml(p.name)}</div>
        </div>
      `).join('');
    }
  }
  
  // ============ DAWN - DEATH SEQUENCE ============
  function showDawnSequence() {
    showScreen('screenDawn');
    
    const theater = $('deathTheater');
    const noDeath = $('noDeath');
    const deathsRow = $('deathsRow');
    
    if (deathQueue.length === 0) {
      if (theater) theater.style.display = 'none';
      if (noDeath) noDeath.style.display = 'block';
      setTimeout(() => showScreen('screenDay'), 3000);
      return;
    }
    
    if (theater) theater.style.display = 'block';
    if (noDeath) noDeath.style.display = 'none';
    
    // Build all death cards and show them one by one with animation
    if (deathsRow) {
      deathsRow.innerHTML = '';
      
      deathQueue.forEach((victim, index) => {
        // Determine if this is a lover death (broken heart)
        const isLover = victim.death_cause === 'heartbreak' || victim.cause === 'heartbreak';
        const cause = isLover ? '💔 mort de chagrin' : getCauseText(victim);
        
        const cardHtml = `
          <div class="death-card ${isLover ? 'lover' : ''}" style="opacity:0;transform:scale(0.5);">
            <div class="card-glow"></div>
            <div class="card-img">
              <img src="${getRoleImage(victim.role)}" alt="${victim.role}">
            </div>
            <div class="death-info">
              <div class="victim-name">${escapeHtml(victim.name)}</div>
              <div class="victim-role">${getRoleName(victim.role)}</div>
              <div class="death-cause">${cause}</div>
            </div>
          </div>
        `;
        
        deathsRow.insertAdjacentHTML('beforeend', cardHtml);
        
        // Animate this card after a delay
        setTimeout(() => {
          const card = deathsRow.children[index];
          if (card) {
            card.style.transition = 'all 0.8s ease-out';
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
            fx?.burst({ kind: 'ember', count: 15 });
          }
        }, 500 + index * 1200); // Stagger by 1.2s each
      });
    }
    
    // Move to day after all deaths shown
    const totalDuration = 500 + deathQueue.length * 1200 + 2500;
    setTimeout(() => {
      deathQueue = [];
      deathIndex = 0;
      showScreen('screenDay');
    }, totalDuration);
  }
  
  function getCauseText(victim) {
    // Check for special causes
    if (victim.death_cause === 'wolves' || victim.cause === 'wolves') {
      return 'dévoré par les loups';
    }
    if (victim.death_cause === 'poison' || victim.cause === 'poison') {
      return 'empoisonné par la sorcière';
    }
    if (victim.death_cause === 'vote' || victim.cause === 'vote') {
      return 'exécuté par le village';
    }
    // Default
    const causes = ['a été trouvé sans vie', 'n\'a pas survécu', 'est mort cette nuit'];
    return causes[Math.floor(Math.random() * causes.length)];
  }
  
  // Keep this for backwards compat but it's not used anymore
  function showNextDeath() {
    // Deprecated - now showing all deaths at once
  }
  
  // ============ DAY ============
  function updateDay() {
    // Day number
    const dayNum = $('dayNumber');
    if (dayNum) dayNum.textContent = state.day_count;
    
    // Council members
    const council = $('councilCircle');
    if (council) {
      council.innerHTML = state.alive.map(p => `
        <div class="council-member">
          <div class="avatar">${(p.name || '?')[0].toUpperCase()}</div>
          <div class="name">${escapeHtml(p.name)}</div>
        </div>
      `).join('');
    }
  }
  
  // ============ VOTE ============
  function buildVoteArena() {
    const arena = $('voteArena');
    if (!arena) return;
    
    arena.innerHTML = state.alive.map(p => `
      <div class="vote-candidate" data-id="${p.id}">
        <div class="avatar">${(p.name || '?')[0].toUpperCase()}</div>
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="votes">0</div>
        <div class="vote-bar"><div class="vote-bar-fill" style="width:0%"></div></div>
      </div>
    `).join('');
  }
  
  function updateVote() {
    // Timer is updated by updateTimer()
  }
  
  function updateVoteProgress(data) {
    // Update progress bar
    const fill = $('voteFill');
    const count = $('voteCount');
    const total = $('voteTotal');
    
    if (count) count.textContent = data.received || 0;
    if (total) total.textContent = data.total || 0;
    if (fill && data.total > 0) {
      fill.style.width = ((data.received / data.total) * 100) + '%';
    }
  }
  
  // ============ EXECUTION ============
  function showExecution(data) {
    showScreen('screenExecution');
    
    const img = $('condemnedImg');
    const name = $('condemnedName');
    const role = $('condemnedRole');
    const tally = $('voteTally');
    
    if (data.eliminated) {
      if (img) img.src = getRoleImage(data.eliminated.role);
      if (name) name.textContent = data.eliminated.name;
      if (role) role.textContent = data.eliminated.role_fr || getRoleName(data.eliminated.role);
      
      fx?.burst({ kind: 'ember', count: 30 });
    } else {
      if (name) name.textContent = 'Personne';
      if (role) role.textContent = 'Pas d\'élimination';
    }
    
    // Show vote breakdown
    if (tally && data.tally) {
      tally.innerHTML = data.tally.map(t => `
        <div class="tally-item">
          <span>${escapeHtml(t.name)}</span>: <span class="count">${t.votes}</span>
        </div>
      `).join('');
    }
  }
  
  // ============ GAME OVER ============
  function showGameOver() {
    showScreen('screenGameOver');
    
    const banner = $('victoryBanner');
    const icon = $('victoryIcon');
    const title = $('victoryTitle');
    const team = $('victoryTeam');
    const roles = $('allRoles');
    
    if (state.winner === 'werewolves') {
      if (banner) banner.classList.add('wolves');
      if (icon) icon.textContent = '🐺';
      if (title) title.textContent = 'Les Loups Triomphent!';
      if (team) team.textContent = 'Le village a été dévoré...';
    } else if (state.winner === 'villagers') {
      if (banner) banner.classList.remove('wolves');
      if (icon) icon.textContent = '🏆';
      if (title) title.textContent = 'Le Village Triomphe!';
      if (team) team.textContent = 'Tous les loups ont été éliminés!';
    } else {
      if (banner) banner.classList.remove('wolves');
      if (icon) icon.textContent = '💀';
      if (title) title.textContent = 'Personne ne Survit';
      if (team) team.textContent = 'Tout le monde est mort...';
    }
    
    // Reveal all roles - show actual role images with staggered animation
    if (roles) {
      const allPlayers = [...state.alive, ...state.dead];
      roles.innerHTML = allPlayers.map(p => `
        <div class="role-card ${p.role === 'werewolf' ? 'wolf' : ''}" data-player="${p.id}">
          <div class="card-img">
            <img src="${getRoleImage(p.role)}" alt="${p.role}">
          </div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="role">${getRoleName(p.role)}</div>
        </div>
      `).join('');
      
      // Animate cards revealing one by one
      const cards = roles.querySelectorAll('.role-card');
      cards.forEach((card, index) => {
        setTimeout(() => {
          card.classList.add('revealed');
          fx?.burst({ kind: 'spark', count: 6 });
        }, 200 + index * 300);
      });
    }
    
    fx?.burst({ kind: 'magic', count: 50 });
  }
  
  // ============ GRAVEYARD ============
  function updateGraveyard() {
    const tombs = $('graveyardTombs');
    const count = $('deadCount');
    
    if (count) count.textContent = state.dead.length;
    
    if (tombs) {
      if (state.dead.length === 0) {
        tombs.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:8px;">Aucune âme... pour l\'instant</div>';
      } else {
        tombs.innerHTML = state.dead.map(p => `
          <div class="tomb ${p.role === 'werewolf' ? 'wolf' : ''}">
            <div class="tomb-card">
              <img src="${getRoleImage(p.role)}" alt="${p.role}">
            </div>
            <div class="info">
              <div class="name">${escapeHtml(p.name)}</div>
              <div class="role">${getRoleName(p.role)}</div>
            </div>
          </div>
        `).join('');
      }
    }
  }
  
  // ============ NARRATOR ============
  function appendNarrator(line) {
    const log = $('narratorLog');
    if (log) {
      // Format line with medieval styling and colors
      const formattedLine = formatNarratorLine(line);
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      
      const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      entry.innerHTML = `
        <div class="log-time">${time}</div>
        <div class="log-text">${formattedLine}</div>
      `;
      
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }
  }
  
  function formatNarratorLine(line) {
    // Remove timestamp from server if present (e.g. "[15:50:50] Axel a rejoint")
    let formatted = line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
    formatted = escapeHtml(formatted);
    
    // Highlight roles
    formatted = formatted.replace(/\b(Loup-Garou|Loup|loups?)\b/gi, '<span class="role-wolf">$1</span>');
    formatted = formatted.replace(/\b(Villageois)\b/gi, '<span class="role-villager">$1</span>');
    formatted = formatted.replace(/\b(Voyante)\b/gi, '<span class="role-seer">$1</span>');
    formatted = formatted.replace(/\b(Sorcière)\b/gi, '<span class="role-witch">$1</span>');
    formatted = formatted.replace(/\b(Cupidon)\b/gi, '<span class="role-cupid">$1</span>');
    
    // Highlight actions
    formatted = formatted.replace(/\b(mort|tué|éliminé|dévoré|assassiné)\b/gi, '<span class="action-death">$1</span>');
    formatted = formatted.replace(/\b(vote|voté|votent)\b/gi, '<span class="action-vote">$1</span>');
    
    // Highlight phase changes
    formatted = formatted.replace(/\b(Nuit \d+)/gi, '<span class="phase-night">🌙 $1</span>');
    formatted = formatted.replace(/\b(Jour \d+)/gi, '<span class="phase-day">☀️ $1</span>');
    
    // Highlight player names that join - make first word bold
    if (formatted.includes('a rejoint le village')) {
      formatted = formatted.replace(/^(\S+)/, '<span class="player-name">$1</span>');
    }
    
    return formatted;
  }
  
  // Narrator panel toggle
  const narratorBtn = $('narratorBtn');
  const narratorPanel = $('narratorPanel');
  const closeNarrator = $('closeNarrator');
  
  if (narratorBtn) {
    narratorBtn.addEventListener('click', () => {
      narratorPanel?.classList.toggle('open');
    });
  }
  
  if (closeNarrator) {
    closeNarrator.addEventListener('click', () => {
      narratorPanel?.classList.remove('open');
    });
  }
  
  // ============ CONFIGURATION SIDEBAR ============
  const configBtn = $('configBtn');
  const configPanel = $('configPanel');
  const closeConfig = $('closeConfig');
  
  if (configBtn) {
    configBtn.addEventListener('click', () => {
      configPanel?.classList.toggle('open');
    });
  }
  
  if (closeConfig) {
    closeConfig.addEventListener('click', () => {
      configPanel?.classList.remove('open');
    });
  }
  
  // Role card selection in config
  document.querySelectorAll('.role-card-config').forEach(card => {
    card.addEventListener('click', () => {
      if (card.classList.contains('disabled')) return;
      
      const checkbox = card.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        card.classList.toggle('active', checkbox.checked);
        fx?.burst({ kind: 'spark', count: 6 });
      }
    });
  });
  
  const applyConfigBtn = $('applyConfigBtn');
  if (applyConfigBtn) {
    applyConfigBtn.addEventListener('click', async () => {
      // Read config values
      const nightMin = parseInt($('cfgNightMin')?.value) || 1;
      const dayMin = parseInt($('cfgDayMin')?.value) || 1;
      const voteMin = parseInt($('cfgVoteMin')?.value) || 1;
      const resultSec = parseInt($('cfgResultSec')?.value) || 30;
      
      config.nightAction = Math.max(10, nightMin * 60);
      config.dayDiscuss = Math.max(10, dayMin * 60);
      config.voteTime = Math.max(10, voteMin * 60);
      config.resultTime = resultSec;
      
      // Read role selections
      config.roles = {
        seer: $('cfgRoleSeer')?.checked ?? true,
        witch: $('cfgRoleWitch')?.checked ?? true,
        cupid: $('cfgRoleCupid')?.checked ?? true,
        hunter: $('cfgRoleHunter')?.checked ?? false
      };
      
      console.log('[TV] Config applied:', config);
      
      // Send to server
      try {
        const res = await fetch(API_URL + '/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        if (res.ok) {
          fx?.burst({ kind: 'spark', count: 20 });
          applyConfigBtn.textContent = '✓ Appliqué!';
          setTimeout(() => {
            applyConfigBtn.textContent = '✓ Appliquer';
          }, 2000);
        }
      } catch (e) {
        console.warn('[TV] Config update failed:', e);
      }
      
      configPanel?.classList.remove('open');
    });
  }
  
  // ============ PLAYER COUNT BUTTON (Start Game) ============
  const playerCountBtn = $('playerCountBtn');
  if (playerCountBtn) {
    playerCountBtn.addEventListener('click', async () => {
      // Only start if we have enough players
      if (!playerCountBtn.classList.contains('ready')) return;
      
      // Visual feedback
      const hintEl = $('startHint');
      if (hintEl) hintEl.textContent = '⏳ Lancement...';
      playerCountBtn.style.pointerEvents = 'none';
      
      // Send config first
      try {
        const nightMin = parseInt($('cfgNightMin')?.value) || 1;
        const dayMin = parseInt($('cfgDayMin')?.value) || 1;
        const voteMin = parseInt($('cfgVoteMin')?.value) || 1;
        const resultSec = parseInt($('cfgResultSec')?.value) || 30;
        
        config.nightAction = Math.max(10, nightMin * 60);
        config.dayDiscuss = Math.max(10, dayMin * 60);
        config.voteTime = Math.max(10, voteMin * 60);
        config.resultTime = resultSec;
        
        config.roles = {
          seer: $('cfgRoleSeer')?.checked ?? true,
          witch: $('cfgRoleWitch')?.checked ?? true,
          cupid: $('cfgRoleCupid')?.checked ?? true,
          hunter: $('cfgRoleHunter')?.checked ?? false
        };
        
        await fetch(API_URL + '/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
      } catch (e) {
        console.warn('[TV] Config send failed:', e);
      }
      
      // Start game
      try {
        const res = await fetch(API_URL + '/api/start', { method: 'POST' });
        const data = await res.json();
        
        if (!data.ok) {
          alert('Erreur: ' + (data.error || 'Impossible de démarrer'));
          if (hintEl) hintEl.textContent = '▶ COMMENCER';
          playerCountBtn.style.pointerEvents = '';
        }
      } catch (e) {
        console.error('[TV] Start error:', e);
        if (hintEl) hintEl.textContent = '▶ COMMENCER';
        playerCountBtn.style.pointerEvents = '';
      }
    });
  }
  
  // Replay button - same players, new roles
  const replayBtn = $('replayBtn');
  if (replayBtn) {
    replayBtn.addEventListener('click', async () => {
      replayBtn.disabled = true;
      replayBtn.textContent = '⏳ Redistribution des rôles...';
      
      try {
        const res = await fetch(API_URL + '/api/replay', { method: 'POST' });
        const data = await res.json();
        
        if (!data.ok) {
          alert('Erreur: ' + (data.error || 'Impossible de rejouer'));
          replayBtn.disabled = false;
          replayBtn.innerHTML = '🔄 Rejouer (mêmes joueurs)';
        }
      } catch (e) {
        console.error('[TV] Replay error:', e);
        replayBtn.disabled = false;
        replayBtn.innerHTML = '🔄 Rejouer (mêmes joueurs)';
      }
    });
  }
  
  // Reset button - completely new game
  const resetBtn = $('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('Commencer une nouvelle partie avec de nouveaux joueurs?')) return;
      
      try {
        await fetch(API_URL + '/api/reset', { method: 'POST' });
      } catch (e) {
        console.error('[TV] Reset error:', e);
      }
    });
  }
  
  // ============ AMBIENT EFFECTS ============
  function createAmbientParticles() {
    const container = $('ambientParticles');
    if (!container) return;
    
    // Create floating particles
    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: absolute;
        width: ${2 + Math.random() * 4}px;
        height: ${2 + Math.random() * 4}px;
        background: rgba(255, 255, 255, ${0.1 + Math.random() * 0.2});
        border-radius: 50%;
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        animation: float ${10 + Math.random() * 20}s linear infinite;
        animation-delay: ${-Math.random() * 20}s;
      `;
      container.appendChild(particle);
    }
  }
  
  // Add float animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes float {
      0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translateY(-100px) rotate(720deg); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  // ============ INITIALIZE ============
  createAmbientParticles();
  connect();
  
  console.log('[TV] === INITIALIZATION COMPLETE ===');
}