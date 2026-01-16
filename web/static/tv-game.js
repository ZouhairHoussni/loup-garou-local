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
    // Player count
    const count = $('playerCount');
    if (count) count.textContent = state.alive.length;
    
    // Start button
    const startBtn = $('startBtn');
    if (startBtn) {
      startBtn.disabled = state.alive.length < 5;
    }
    
    // Players in circle
    const ring = $('playersRing');
    if (ring) {
      const players = state.alive;
      const n = players.length;
      const radius = 110;
      
      ring.innerHTML = players.map((p, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const x = 140 + radius * Math.cos(angle);
        const y = 140 + radius * Math.sin(angle);
        
        return `
          <div class="player-token" style="left:${x}px;top:${y}px;">
            <div class="avatar">${(p.name || '?')[0].toUpperCase()}</div>
            <div class="name">${escapeHtml(p.name)}</div>
          </div>
        `;
      }).join('');
    }
    
    // Join URL
    const joinUrl = $('joinUrl');
    if (joinUrl) {
      const playerUrl = `${window.location.protocol}//${host}${portPart}/player/`;
      joinUrl.textContent = playerUrl;
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
    
    if (deathQueue.length === 0) {
      theater.style.display = 'none';
      noDeath.style.display = 'block';
      setTimeout(() => showScreen('screenDay'), 3000);
      return;
    }
    
    theater.style.display = 'block';
    noDeath.style.display = 'none';
    deathIndex = 0;
    
    showNextDeath();
  }
  
  function showNextDeath() {
    if (deathIndex >= deathQueue.length) {
      // All deaths shown, move to day
      setTimeout(() => {
        deathQueue = [];
        deathIndex = 0;
        showScreen('screenDay');
      }, 2000);
      return;
    }
    
    const victim = deathQueue[deathIndex];
    
    // Update death card
    const card = $('deathCard');
    const img = $('deathCardImg');
    const name = $('victimName');
    const role = $('victimRole');
    const cause = $('deathCause');
    const current = $('deathCurrent');
    const total = $('deathTotal');
    
    if (img) img.src = getRoleImage(victim.role);
    if (name) name.textContent = victim.name;
    if (role) role.textContent = getRoleName(victim.role);
    if (cause) {
      // Determine death cause based on role and context
      const causes = [
        'a été dévoré par les loups',
        'a été trouvé sans vie',
        'n\'a pas survécu à la nuit'
      ];
      cause.textContent = causes[Math.floor(Math.random() * causes.length)];
    }
    if (current) current.textContent = deathIndex + 1;
    if (total) total.textContent = deathQueue.length;
    
    // Animate card
    if (card) {
      card.style.animation = 'none';
      card.offsetHeight; // Trigger reflow
      card.style.animation = 'deathReveal 1s ease-out';
    }
    
    fx?.burst({ kind: 'ember', count: 25 });
    
    // Show next death after delay
    deathIndex++;
    setTimeout(showNextDeath, 4000);
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
      log.textContent += line + '\n';
      log.scrollTop = log.scrollHeight;
    }
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
  
  // ============ CONFIGURATION ============
  const configToggle = $('configToggle');
  const configPanel = $('configPanel');
  
  if (configToggle && configPanel) {
    configToggle.addEventListener('click', () => {
      configPanel.classList.toggle('open');
    });
  }
  
  // Role card selection
  const rolesGrid = $('rolesCardsGrid');
  if (rolesGrid) {
    rolesGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.role-config-card');
      if (!card || card.classList.contains('disabled')) return;
      
      const checkbox = card.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        card.classList.toggle('active', checkbox.checked);
        fx?.burst({ kind: 'spark', count: 6 });
      }
    });
  }
  
  const applyConfigBtn = $('applyConfigBtn');
  if (applyConfigBtn) {
    applyConfigBtn.addEventListener('click', async () => {
      // Read config values
      config.nightAction = parseInt($('cfgNightAction')?.value) || 22;
      config.dayDiscuss = parseInt($('cfgDayDiscuss')?.value) || 15;
      config.voteTime = parseInt($('cfgVoteTime')?.value) || 25;
      config.resultTime = parseInt($('cfgResultTime')?.value) || 5;
      
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
          // Visual feedback
          applyConfigBtn.textContent = '✓ Configuration Appliquée!';
          setTimeout(() => {
            applyConfigBtn.textContent = '⚔️ Appliquer la Configuration';
          }, 2000);
        }
      } catch (e) {
        console.warn('[TV] Config update failed:', e);
      }
      
      // Close panel
      configPanel?.classList.remove('open');
    });
  }
  
  // ============ BUTTONS ============
  const startBtn = $('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      startBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Lancement...</span>';
      
      try {
        const res = await fetch(API_URL + '/api/start', { method: 'POST' });
        const data = await res.json();
        
        if (!data.ok) {
          alert('Erreur: ' + (data.error || 'Impossible de démarrer'));
          startBtn.disabled = false;
          startBtn.innerHTML = '<span class="btn-icon">⚔️</span><span>Que la chasse commence!</span>';
        }
      } catch (e) {
        console.error('[TV] Start error:', e);
        startBtn.disabled = false;
        startBtn.innerHTML = '<span class="btn-icon">⚔️</span><span>Que la chasse commence!</span>';
      }
    });
  }
  
  const resetBtn = $('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('Recommencer une nouvelle partie?')) return;
      
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