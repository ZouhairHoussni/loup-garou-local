/**
 * Loup-Garou - Immersive Game UI
 * Fixed version with working role peek on hold
 */

// Wait for DOM
document.addEventListener('DOMContentLoaded', init);

function init() {
  console.log('[LG] === GAME UI STARTING ===');
  
  // Inject additional styles for witch UI
  const witchStyles = document.createElement('style');
  witchStyles.textContent = `
    .witch-poison-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 8px;
      margin: 12px 0;
      padding: 8px;
      background: rgba(0,0,0,0.2);
      border-radius: 12px;
    }
    .target-btn-compact {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(0,0,0,0.3);
      border: 2px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      color: #f5f0e8;
      cursor: pointer;
      transition: all 0.2s;
    }
    .target-btn-compact:hover {
      background: rgba(139,0,0,0.4);
      border-color: #8b0000;
    }
    .target-btn-compact .target-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }
    .target-btn-compact .target-name {
      font-size: 13px;
      font-weight: 600;
    }
    .witch-selected-target {
      padding: 12px 16px;
      background: rgba(139,0,0,0.3);
      border: 2px solid #8b0000;
      border-radius: 10px;
      margin: 12px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .witch-selected-target strong {
      color: #ff6b6b;
    }
    .btn-clear {
      margin-left: auto;
      padding: 4px 10px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      color: #f5f0e8;
      cursor: pointer;
    }
    .btn-clear:hover {
      background: rgba(255,255,255,0.2);
    }
  `;
  document.head.appendChild(witchStyles);
  
  // Simple element getter
  const $ = id => {
    const el = document.getElementById(id);
    if (!el) console.warn('[LG] Element not found:', id);
    return el;
  };
  
  // Parse URL params
  const params = new URLSearchParams(window.location.search);
  const config = {
    host: params.get('backendHost') || window.location.hostname,
    port: params.get('backendPort') || window.location.port || '8000',
    playerId: params.get('player_id') || '',
    playerName: params.get('name') || '',
    autoJoin: params.get('autojoin') === '1',
    isBot: params.get('bot') === '1'
  };
  
  // Build URLs - handle case where port might be empty (production)
  const portPart = config.port ? `:${config.port}` : '';
  const API_URL = `${window.location.protocol}//${config.host}${portPart}`;
  const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${config.host}${portPart}`;
  
  console.log('[LG] Config:', config);
  console.log('[LG] API URL:', API_URL);
  
  // Game state
  let state = {
    phase: 'LOBBY',
    me: null,
    alive: [],
    dead: [],
    wolves_team: null,
    wolves_votes: null,
    witch_ctx: null,
    pending_step: null,
    pending_deadline: null,
    timers: null,
    winner: null,
    winner_fr: null,
    lover_name: null
  };
  
  let ws = null;
  let currentScreen = null;
  
  // FX (optional)
  const fx = window.LGFX?.init($('fxCanvas'), { mode: 'night' });
  
  // ============ SCREENS ============
  const allScreens = [
    'screenJoin', 'screenWaiting', 'screenRole', 'screenNightWait',
    'screenNightAction', 'screenDay', 'screenVote', 'screenResult',
    'screenGameOver', 'screenDead'
  ];
  
  function showScreen(screenId) {
    console.log('[LG] Showing screen:', screenId);
    allScreens.forEach(id => {
      const el = $(id);
      if (el) {
        el.style.display = (id === screenId) ? 'flex' : 'none';
      }
    });
    currentScreen = screenId;
    fx?.burst({ kind: 'magic', count: 10 });
  }
  
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
      cupid: 'Cupidon'
    };
    return names[role] || '???';
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
  
  function setConnected(connected) {
    const dot = $('connStatus');
    if (dot) {
      dot.classList.toggle('connected', connected);
    }
  }
  
  // ============ JOIN ============
  async function joinGame(name) {
    console.log('[LG] Joining game with name:', name);
    
    try {
      const response = await fetch(API_URL + '/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
      });
      
      console.log('[LG] Join response status:', response.status);
      
      const data = await response.json();
      console.log('[LG] Join response data:', data);
      
      if (!data.ok) {
        throw new Error(data.error || 'Join failed');
      }
      
      // Save player ID
      config.playerId = data.player_id;
      config.playerName = name;
      
      // Update URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('player_id', config.playerId);
      newUrl.searchParams.set('name', name);
      window.history.replaceState({}, '', newUrl.toString());
      
      console.log('[LG] Joined! Player ID:', config.playerId);
      
      // Connect WebSocket and show waiting
      connectWebSocket();
      showScreen('screenWaiting');
      
      return true;
    } catch (error) {
      console.error('[LG] Join error:', error);
      alert('Erreur de connexion: ' + error.message);
      return false;
    }
  }
  
  // ============ WEBSOCKET ============
  function connectWebSocket() {
    if (!config.playerId) {
      console.log('[LG] No player ID, skipping WS connect');
      return;
    }
    
    const url = WS_URL + '/ws?client=player&player_id=' + encodeURIComponent(config.playerId);
    console.log('[LG] Connecting WebSocket:', url);
    
    ws = new WebSocket(url);
    
    ws.onopen = () => {
      console.log('[LG] WebSocket connected');
      setConnected(true);
    };
    
    ws.onclose = () => {
      console.log('[LG] WebSocket closed, reconnecting...');
      setConnected(false);
      setTimeout(connectWebSocket, 1500);
    };
    
    ws.onerror = (err) => {
      console.error('[LG] WebSocket error:', err);
      setConnected(false);
    };
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error('[LG] Failed to parse message:', e);
      }
    };
  }
  
  // ============ MESSAGE HANDLING ============
  function handleMessage(msg) {
    console.log('[LG] Message:', msg.type, msg);
    
    switch (msg.type) {
      case 'PUBLIC_STATE':
        state.phase = msg.data.phase;
        state.alive = msg.data.alive || [];
        state.dead = msg.data.dead || [];
        state.timers = msg.data.timers;
        state.started = msg.data.started;
        state.winner = msg.data.winner;
        updateUI();
        break;
        
      case 'PRIVATE_STATE':
        console.log('[LG] PRIVATE_STATE received:', msg.data);
        state.me = msg.data.me;
        state.wolves_team = msg.data.wolves_team;
        state.wolves_votes = msg.data.wolves_votes;
        state.witch_ctx = msg.data.witch_ctx;
        state.pending_step = msg.data.pending_step;
        state.pending_deadline = msg.data.pending_deadline;
        state.lover_name = msg.data.lover_name;
        
        console.log('[LG] My role:', state.me?.role);
        console.log('[LG] Pending step:', state.pending_step);
        
        // Update role button image when we know the role
        updateRoleButton();
        
        // First time seeing role after game started?
        if (state.me?.role && state.started && currentScreen === 'screenWaiting') {
          console.log('[LG] First time seeing role, showing reveal screen');
          showRoleReveal();
        }
        updateUI();
        break;
        
      case 'SEER_RESULT':
        showModal('Vision', `
          <img src="${getRoleImage(msg.role)}" style="width:120px;height:120px;border-radius:12px;">
          <div style="font-size:20px;font-weight:bold;margin-top:12px;">${escapeHtml(msg.target_name)}</div>
          <div style="color:#aaa;">${msg.role_fr || getRoleName(msg.role)}</div>
        `);
        break;
        
      case 'LOVER_ASSIGNED':
        state.lover_name = msg.lover_name;
        showModal('💕 Cupidon', `
          <div style="font-size:48px;">💕</div>
          <div style="margin-top:12px;">Tu es amoureux/amoureuse de</div>
          <div style="font-size:24px;font-weight:bold;color:#d4a24c;">${escapeHtml(msg.lover_name)}</div>
          <div style="margin-top:12px;color:#aaa;font-size:14px;">Si l'un de vous meurt, l'autre meurt aussi de chagrin.</div>
        `);
        break;
        
      case 'WITCH_CONTEXT':
        state.witch_ctx = {
          victim_id: msg.wolves_victim_id,
          victim_name: msg.wolves_victim_name,
          heal_used: msg.heal_used,
          poison_used: msg.poison_used
        };
        break;
        
      case 'VOTE_RESULT':
        showVoteResult(msg);
        break;
        
      case 'GAME_OVER':
        state.winner = msg.winner;
        state.winner_fr = msg.winner_fr;
        state.phase = 'GAME_OVER';
        showGameOver();
        break;
        
      case 'ACTION_REQUEST':
        console.log('[LG] ACTION_REQUEST received:', msg);
        state.pending_step = msg.step;
        state.pending_deadline = msg.deadline;
        updateUI();
        break;
        
      case 'RESET':
        window.location.href = window.location.pathname;
        break;
    }
  }
  
  // ============ ROLE BUTTON ============
  function updateRoleButton() {
    const roleBtn = $('roleBtn');
    if (!roleBtn) return;
    
    // Show button if we have a role and not on join/waiting/role screens
    const shouldShow = state.me?.role && 
                       currentScreen !== 'screenJoin' && 
                       currentScreen !== 'screenRole' &&
                       currentScreen !== 'screenWaiting';
    
    roleBtn.style.display = shouldShow ? 'block' : 'none';
    console.log('[LG] Role button visibility:', shouldShow, 'role:', state.me?.role);
  }
  
  // ============ UI UPDATES ============
  let lastBuiltStep = null;
  let lastPhase = null;
  
  function updateUI() {
    // Update player count in waiting screen
    const countEl = $('playerCount');
    if (countEl) {
      const total = state.alive.length + state.dead.length;
      countEl.textContent = total + ' joueur(s)';
    }
    
    // Update timers
    updateTimers();
    
    // Update role button
    updateRoleButton();
    
    // Dead check
    if (state.me && !state.me.alive && state.phase !== 'GAME_OVER' && state.phase !== 'LOBBY') {
      showScreen('screenDead');
      return;
    }
    
    // Track phase changes
    const phaseChanged = (state.phase !== lastPhase);
    if (phaseChanged) {
      console.log('[LG] Phase changed:', lastPhase, '->', state.phase);
    }
    lastPhase = state.phase;
    
    // Phase-based screens
    if (state.phase === 'LOBBY') {
      if (config.playerId && currentScreen !== 'screenRole' && currentScreen !== 'screenWaiting') {
        showScreen('screenWaiting');
      }
    } else if (state.phase === 'NIGHT') {
      handleNightPhase(phaseChanged);
    } else if (state.phase === 'DAY') {
      if (phaseChanged || currentScreen === 'screenNightWait' || currentScreen === 'screenNightAction') {
        showScreen('screenDay');
      }
    } else if (state.phase === 'VOTE') {
      showVoteScreen(phaseChanged);
    } else if (state.phase === 'GAME_OVER') {
      if (phaseChanged) showGameOver();
    }
  }
  
  function updateTimers() {
    // Update various timer displays
    if (state.timers?.seconds_left != null) {
      const secs = state.timers.seconds_left;
      
      // Day timer
      const dayTimer = $('dayTimer');
      if (dayTimer) {
        dayTimer.textContent = secs + 's';
        dayTimer.classList.toggle('urgent', secs <= 5);
      }
      
      // Vote timer
      const voteTimer = $('voteTimer');
      if (voteTimer) {
        voteTimer.textContent = secs + 's';
        voteTimer.classList.toggle('urgent', secs <= 5);
      }
      
      // Action timer (night actions)
      const actionTimer = $('actionTimer');
      if (actionTimer) {
        actionTimer.textContent = secs + 's';
        actionTimer.classList.toggle('urgent', secs <= 5);
      }
    }
  }
  
  // ============ ROLE REVEAL ============
  function showRoleReveal() {
    showScreen('screenRole');
    
    const frontImg = $('cardFrontImg');
    const roleName = $('roleName');
    const roleHint = $('roleHint');
    const roleCard = $('roleCard');
    
    // Reset card to back
    if (roleCard) roleCard.classList.remove('flipped');
    
    if (frontImg && state.me?.role) {
      frontImg.src = getRoleImage(state.me.role);
    }
    if (roleName && state.me?.role) {
      roleName.textContent = getRoleName(state.me.role);
    }
    
    const hints = {
      werewolf: '🐺 Tu es un Loup-Garou. Dévore les villageois la nuit!',
      seer: '🔮 Tu es la Voyante. Chaque nuit, découvre le rôle d\'un joueur.',
      witch: '🧪 Tu es la Sorcière. Tu as une potion de vie et une de mort.',
      cupid: '💘 Tu es Cupidon. La première nuit, désigne deux amoureux.',
      villager: '🏠 Tu es Villageois. Trouve et élimine les loups!'
    };
    if (roleHint && state.me?.role) {
      roleHint.textContent = hints[state.me.role] || '';
    }
    
    // Show wolves team if werewolf
    if (state.me?.role === 'werewolf' && state.wolves_team && state.wolves_team.length > 1) {
      const teamHtml = state.wolves_team.map(w => `<span class="wolf-badge">${escapeHtml(w.name)}</span>`).join(' ');
      if (roleHint) {
        roleHint.innerHTML = hints.werewolf + `
          <div class="wolves-team" style="margin-top:16px;">
            <div class="wolves-team-title">Ta meute</div>
            <div class="wolves-team-list">${teamHtml}</div>
          </div>
        `;
      }
    }
  }
  
  // ============ NIGHT PHASE ============
  function handleNightPhase(phaseChanged) {
    if (!state.me?.alive) {
      showScreen('screenNightWait');
      return;
    }
    
    const myRole = state.me?.role;
    const step = state.pending_step;
    
    console.log('[LG] handleNightPhase - myRole:', myRole, 'step:', step);
    
    const roleSteps = {
      'WOLVES': 'werewolf',
      'SEER': 'seer',
      'WITCH': 'witch',
      'CUPID': 'cupid'
    };
    
    // Check if it's my turn to act
    const isMyTurn = step && roleSteps[step] === myRole;
    console.log('[LG] Is my turn:', isMyTurn);
    
    if (isMyTurn) {
      // Only rebuild action UI if the step changed
      if (step !== lastBuiltStep || phaseChanged) {
        console.log('[LG] Building action UI for step:', step);
        showScreen('screenNightAction');
        buildActionUI(step);
        lastBuiltStep = step;
      }
    } else {
      // Not my turn - show waiting screen
      if (currentScreen !== 'screenNightWait' && currentScreen !== 'screenRole') {
        showScreen('screenNightWait');
        
        // Update wait message based on current step
        const waitMsg = $('nightWaitMsg');
        if (waitMsg) {
          const messages = {
            'CUPID': 'Cupidon choisit les amoureux...',
            'WOLVES': 'Les loups chassent...',
            'SEER': 'La voyante consulte les esprits...',
            'WITCH': 'La sorcière prépare ses potions...'
          };
          waitMsg.textContent = step ? messages[step] || 'Ferme les yeux et attends…' : 'Ferme les yeux et attends…';
        }
      }
      lastBuiltStep = null;
    }
  }
  
  // ============ ACTION UI ============
  function buildActionUI(step) {
    const title = $('actionTitle');
    const subtitle = $('actionSubtitle');
    const grid = $('targets');  // This is the correct ID from the HTML
    const confirmBtn = $('confirmActionBtn');
    
    console.log('[LG] buildActionUI - step:', step);
    console.log('[LG] Elements found - title:', !!title, 'subtitle:', !!subtitle, 'grid:', !!grid, 'confirmBtn:', !!confirmBtn);
    
    if (!grid) {
      console.error('[LG] Target grid not found!');
      return;
    }
    
    grid.innerHTML = '';
    if (confirmBtn) confirmBtn.style.display = 'none';
    
    const allTargets = state.alive.filter(p => p.id !== config.playerId);
    
    if (step === 'WOLVES') {
      if (title) title.textContent = '🐺 Choisissez une victime';
      if (subtitle) subtitle.textContent = 'Désignez un villageois à dévorer';
      
      // Filter out wolves from targets
      const wolfIds = (state.wolves_team || []).map(w => w.id);
      const validTargets = state.alive.filter(p => !wolfIds.includes(p.id));
      
      console.log('[LG] Wolf targets:', validTargets.length);
      
      // Show current wolf votes if any
      if (state.wolves_votes && Object.keys(state.wolves_votes).length > 0) {
        const voteCounts = {};
        Object.values(state.wolves_votes).forEach(targetId => {
          if (targetId) {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
          }
        });
        
        buildTargetGrid(grid, validTargets, (id) => {
          submitAction('WOLVES', { target: id });
          markSelected(grid, id);
        }, voteCounts);
      } else {
        buildTargetGrid(grid, validTargets, (id) => {
          submitAction('WOLVES', { target: id });
          markSelected(grid, id);
        });
      }
      
    } else if (step === 'SEER') {
      if (title) title.textContent = '🔮 Consulte les esprits';
      if (subtitle) subtitle.textContent = 'Choisis un joueur à révéler';
      
      let selectedId = null;
      buildTargetGrid(grid, allTargets, (id) => {
        selectedId = id;
        markSelected(grid, id);
        if (confirmBtn) confirmBtn.style.display = 'block';
      });
      
      if (confirmBtn) {
        confirmBtn.textContent = 'Révéler';
        confirmBtn.onclick = () => {
          if (selectedId) {
            submitAction('SEER', { target: selectedId });
            grid.innerHTML = '<div style="color:#888;padding:20px;">🔮 Vision en cours...</div>';
            confirmBtn.style.display = 'none';
          }
        };
      }
      
    } else if (step === 'WITCH') {
      if (title) title.textContent = '🧪 Tes potions magiques';
      
      // Build witch UI
      let subtitleHtml = '';
      
      // Show victim info
      if (state.witch_ctx?.victim_name) {
        subtitleHtml += `
          <div class="witch-victim">
            <div class="witch-victim-label">Victime des loups cette nuit</div>
            <div class="witch-victim-name">💀 ${escapeHtml(state.witch_ctx.victim_name)}</div>
          </div>
        `;
      } else {
        subtitleHtml += `
          <div style="color:#888;margin-bottom:16px;">Personne n'a été attaqué cette nuit.</div>
        `;
      }
      
      const canHeal = !state.me?.witch_heal_used && state.witch_ctx?.victim_name;
      const canPoison = !state.me?.witch_poison_used;
      
      subtitleHtml += `
        <div class="witch-potions">
          <button id="witchHealBtn" class="potion-btn" ${canHeal ? '' : 'disabled'}>
            <div class="potion-icon">💚</div>
            <div class="potion-label">${state.me?.witch_heal_used ? 'Utilisée' : 'Sauver'}</div>
          </button>
          <button id="witchPoisonBtn" class="potion-btn" ${canPoison ? '' : 'disabled'}>
            <div class="potion-icon">💀</div>
            <div class="potion-label">${state.me?.witch_poison_used ? 'Utilisée' : 'Empoisonner'}</div>
          </button>
        </div>
        <div id="witchPoisonTargets" class="witch-poison-grid" style="display:none;max-height:180px;overflow-y:auto;"></div>
        <div id="witchSelectedTarget" class="witch-selected-target" style="display:none;"></div>
      `;
      
      if (subtitle) subtitle.innerHTML = subtitleHtml;
      
      let useHeal = false;
      let poisonTarget = null;
      
      // Set up button handlers after DOM update
      setTimeout(() => {
        const healBtn = $('witchHealBtn');
        const poisonBtn = $('witchPoisonBtn');
        const poisonTargets = $('witchPoisonTargets');
        const selectedDiv = $('witchSelectedTarget');
        
        if (healBtn && canHeal) {
          healBtn.onclick = () => {
            useHeal = !useHeal;
            healBtn.classList.toggle('selected', useHeal);
          };
        }
        
        if (poisonBtn && canPoison) {
          poisonBtn.onclick = () => {
            const showTargets = !poisonBtn.classList.contains('selected');
            poisonBtn.classList.toggle('selected', showTargets);
            
            if (showTargets && poisonTargets) {
              poisonTargets.style.display = 'grid';
              poisonTargets.innerHTML = '';
              // Build compact target grid
              allTargets.forEach(p => {
                const btn = document.createElement('button');
                btn.className = 'target-btn-compact';
                btn.innerHTML = `<span class="target-avatar">${(p.name||'?')[0].toUpperCase()}</span><span class="target-name">${escapeHtml(p.name)}</span>`;
                btn.onclick = (e) => {
                  e.stopPropagation();
                  poisonTarget = p.id;
                  // Collapse grid and show selection
                  poisonTargets.style.display = 'none';
                  if (selectedDiv) {
                    selectedDiv.style.display = 'block';
                    selectedDiv.innerHTML = `<span>Cible: </span><strong>${escapeHtml(p.name)}</strong> <button id="witchClearTarget" class="btn-clear">✕</button>`;
                    const clearBtn = $('witchClearTarget');
                    if (clearBtn) {
                      clearBtn.onclick = () => {
                        poisonTarget = null;
                        poisonBtn.classList.remove('selected');
                        selectedDiv.style.display = 'none';
                      };
                    }
                  }
                };
                poisonTargets.appendChild(btn);
              });
            } else if (poisonTargets) {
              poisonTargets.style.display = 'none';
              poisonTargets.innerHTML = '';
              if (selectedDiv) selectedDiv.style.display = 'none';
              poisonTarget = null;
            }
          };
        }
      }, 10);
      
      if (confirmBtn) {
        confirmBtn.style.display = 'block';
        confirmBtn.textContent = 'Valider mes choix';
        confirmBtn.onclick = () => {
          submitAction('WITCH', { heal: useHeal, poison_target: poisonTarget });
          if (subtitle) subtitle.innerHTML = '<div style="color:#888;padding:20px;">✨ Potions utilisées...</div>';
          grid.innerHTML = '';
          confirmBtn.style.display = 'none';
        };
      }
      
    } else if (step === 'CUPID') {
      if (title) title.textContent = '💘 Désigne les amoureux';
      if (subtitle) {
        subtitle.innerHTML = `
          <div style="margin-bottom:16px;">Choisis deux joueurs qui seront liés par l'amour.</div>
          <div class="cupid-selections">
            <div id="cupidSlot1" class="cupid-slot">
              <div class="slot-avatar">1</div>
              <div class="slot-name">---</div>
            </div>
            <div id="cupidSlot2" class="cupid-slot">
              <div class="slot-avatar">2</div>
              <div class="slot-name">---</div>
            </div>
          </div>
        `;
      }
      
      let lovers = [];
      
      // Cupid can choose anyone including themselves
      buildTargetGrid(grid, state.alive, (id, name) => {
        const idx = lovers.indexOf(id);
        if (idx >= 0) {
          lovers.splice(idx, 1);
        } else if (lovers.length < 2) {
          lovers.push(id);
        }
        
        // Update slots
        const slot1 = $('cupidSlot1');
        const slot2 = $('cupidSlot2');
        const getName = (lid) => state.alive.find(p => p.id === lid)?.name || '?';
        
        if (slot1) {
          if (lovers[0]) {
            slot1.classList.add('filled');
            slot1.innerHTML = `
              <div class="slot-avatar">${getName(lovers[0])[0].toUpperCase()}</div>
              <div class="slot-name">${escapeHtml(getName(lovers[0]))}</div>
            `;
          } else {
            slot1.classList.remove('filled');
            slot1.innerHTML = `<div class="slot-avatar">1</div><div class="slot-name">---</div>`;
          }
        }
        
        if (slot2) {
          if (lovers[1]) {
            slot2.classList.add('filled');
            slot2.innerHTML = `
              <div class="slot-avatar">${getName(lovers[1])[0].toUpperCase()}</div>
              <div class="slot-name">${escapeHtml(getName(lovers[1]))}</div>
            `;
          } else {
            slot2.classList.remove('filled');
            slot2.innerHTML = `<div class="slot-avatar">2</div><div class="slot-name">---</div>`;
          }
        }
        
        // Update selection visual
        grid.querySelectorAll('.target-card').forEach(card => {
          card.classList.toggle('selected', lovers.includes(card.dataset.id));
        });
        
        if (confirmBtn) confirmBtn.style.display = lovers.length === 2 ? 'block' : 'none';
      });
      
      if (confirmBtn) {
        confirmBtn.textContent = '💕 Unir ces âmes';
        confirmBtn.onclick = () => {
          if (lovers.length === 2) {
            submitAction('CUPID', { targets: lovers });
            grid.innerHTML = '<div style="color:#888;padding:20px;">💕 Amoureux désignés!</div>';
            if (subtitle) subtitle.innerHTML = '<div style="font-size:48px;">💕</div>';
            confirmBtn.style.display = 'none';
          }
        };
      }
    }
  }
  
  function buildTargetGrid(container, players, onClick, voteCounts = {}) {
    container.innerHTML = '';
    
    players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'target-card';
      card.dataset.id = p.id;
      
      // Check if this is a wolf teammate
      const isWolf = state.wolves_team?.some(w => w.id === p.id);
      if (isWolf) card.classList.add('is-wolf');
      
      // Show vote count if any
      const votes = voteCounts[p.id] || 0;
      const voteBadge = votes > 0 ? `<div style="position:absolute;top:-8px;right:-8px;background:#d4a24c;color:#000;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;">${votes}</div>` : '';
      
      card.innerHTML = `
        <div class="target-avatar" style="position:relative;">
          ${(p.name || '?')[0].toUpperCase()}
          ${voteBadge}
        </div>
        <div class="target-name">${escapeHtml(p.name)}</div>
      `;
      card.addEventListener('click', () => onClick(p.id, p.name));
      container.appendChild(card);
    });
  }
  
  function markSelected(container, id) {
    container.querySelectorAll('.target-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.id === id);
    });
  }
  
  async function submitAction(step, data) {
    console.log('[LG] Submitting action:', step, data);
    try {
      const res = await fetch(API_URL + '/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: config.playerId, step: step, data: data })
      });
      const result = await res.json();
      console.log('[LG] Action result:', result);
    } catch (e) {
      console.error('[LG] Action failed:', e);
    }
  }
  
  // ============ VOTE ============
  let voteGridBuilt = false;
  let hasVoted = false;
  
  function showVoteScreen(phaseChanged) {
    if (phaseChanged) {
      voteGridBuilt = false;
      hasVoted = false;
    }
    
    if (currentScreen !== 'screenVote') {
      showScreen('screenVote');
    }
    
    // Only build grid once per vote phase
    if (voteGridBuilt) return;
    voteGridBuilt = true;
    
    const grid = $('voteTargets');  // Correct ID from HTML
    if (!grid) {
      console.error('[LG] Vote targets grid not found!');
      return;
    }
    
    console.log('[LG] Building vote grid');
    
    // Can vote for anyone alive except yourself
    const targets = state.alive.filter(p => p.id !== config.playerId);
    
    buildTargetGrid(grid, targets, async (id) => {
      if (hasVoted) return; // Prevent double voting
      
      console.log('[LG] Voting for:', id);
      try {
        const res = await fetch(API_URL + '/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voter_id: config.playerId, target_id: id })
        });
        const data = await res.json();
        console.log('[LG] Vote result:', data);
        if (data.ok) {
          hasVoted = true;
          markSelected(grid, id);
          
          // Show confirmation
          const status = $('voteStatus');
          if (status) {
            const targetName = targets.find(p => p.id === id)?.name || '???';
            status.innerHTML = `<div class="vote-confirm">✓ Tu as voté contre ${escapeHtml(targetName)}</div>`;
          }
        }
      } catch (e) {
        console.error('[LG] Vote failed:', e);
      }
    });
    
    // Clear status
    const status = $('voteStatus');
    if (status) status.innerHTML = '';
  }
  
  function showVoteResult(msg) {
    showScreen('screenResult');
    const resultMsg = $('resultMsg');
    
    if (resultMsg) {
      if (msg.eliminated) {
        resultMsg.innerHTML = `
          <div style="margin-bottom:16px;">Le village a décidé...</div>
          <div style="font-size:24px;font-weight:bold;margin-bottom:8px;">${escapeHtml(msg.eliminated.name)}</div>
          <div style="color:#aaa;margin-bottom:16px;">a été éliminé</div>
          <img src="${getRoleImage(msg.eliminated.role)}" style="width:120px;height:120px;border-radius:12px;margin-bottom:12px;">
          <div style="color:#d4a24c;">${msg.eliminated.role_fr || getRoleName(msg.eliminated.role)}</div>
        `;
      } else {
        resultMsg.innerHTML = `
          <div style="font-size:24px;font-weight:bold;">Pas d'élimination</div>
          <div style="color:#aaa;">Le village n'a pas réussi à se décider.</div>
        `;
      }
    }
  }
  
  // Continue button on result screen
  const continueBtn = $('continueBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      // Just go back to waiting - the server will drive the next phase
      if (state.phase === 'NIGHT') {
        showScreen('screenNightWait');
      } else if (state.phase === 'DAY') {
        showScreen('screenDay');
      }
    });
  }
  
  // ============ GAME OVER ============
  function showGameOver() {
    showScreen('screenGameOver');
    
    const winnerMsg = $('winnerMsg');
    const icon = document.querySelector('#screenGameOver .gameover-icon');
    
    if (winnerMsg) {
      if (state.winner === 'werewolves') {
        if (icon) icon.textContent = '🐺';
        winnerMsg.innerHTML = `
          <div style="font-size:28px;font-weight:bold;color:#8b0000;">Les Loups-Garous</div>
          <div style="color:#aaa;margin-top:8px;">ont dévoré le village!</div>
        `;
      } else if (state.winner === 'villagers') {
        if (icon) icon.textContent = '🏆';
        winnerMsg.innerHTML = `
          <div style="font-size:28px;font-weight:bold;color:#27ae60;">Les Villageois</div>
          <div style="color:#aaa;margin-top:8px;">ont éliminé tous les loups!</div>
        `;
      } else {
        if (icon) icon.textContent = '💀';
        winnerMsg.innerHTML = `
          <div style="font-size:28px;font-weight:bold;">Personne</div>
          <div style="color:#aaa;margin-top:8px;">Tout le monde est mort...</div>
        `;
      }
    }
    
    fx?.burst({ kind: 'magic', count: 30 });
  }
  
  // Back to join button
  const backToJoinBtn = $('backToJoinBtn');
  if (backToJoinBtn) {
    backToJoinBtn.addEventListener('click', () => {
      window.location.href = window.location.pathname;
    });
  }
  
  // ============ MODAL ============
  function showModal(title, content) {
    const modal = $('modal');
    const titleEl = $('modalTitle');
    const bodyEl = $('modalBody');
    
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = content;
    if (modal) modal.classList.add('open');
    
    fx?.burst({ kind: 'spark', count: 15 });
  }
  
  function closeModal() {
    const modal = $('modal');
    if (modal) modal.classList.remove('open');
  }
  
  // ============ EVENT LISTENERS ============
  
  // Join button
  const joinBtn = $('joinBtn');
  const nameInput = $('nameInput');
  
  console.log('[LG] Join elements found:', !!joinBtn, !!nameInput);
  
  if (joinBtn) {
    joinBtn.addEventListener('click', async function() {
      console.log('[LG] JOIN BUTTON CLICKED!');
      
      const name = nameInput ? nameInput.value.trim() : '';
      console.log('[LG] Name value:', name);
      
      if (!name) {
        if (nameInput) {
          nameInput.focus();
          nameInput.style.borderColor = '#c0392b';
          setTimeout(() => { nameInput.style.borderColor = ''; }, 1000);
        }
        return;
      }
      
      joinBtn.disabled = true;
      joinBtn.textContent = 'Connexion...';
      
      const success = await joinGame(name);
      
      if (!success) {
        joinBtn.disabled = false;
        joinBtn.textContent = 'Entrer dans le village';
      }
    });
  }
  
  if (nameInput) {
    nameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && joinBtn) {
        joinBtn.click();
      }
    });
  }
  
  // Role card flip
  const roleCard = $('roleCard');
  if (roleCard) {
    roleCard.addEventListener('click', function() {
      roleCard.classList.toggle('flipped');
      fx?.burst({ kind: 'spark', count: 12 });
    });
  }
  
  // ============ ROLE PEEK (HOLD TO REVEAL) ============
  const roleBtn = $('roleBtn');
  const rolePeek = $('rolePeek');
  const rolePeekImg = $('rolePeekImg');
  const roleBtnImg = $('roleBtnImg');
  
  console.log('[LG] Role peek elements:', {
    roleBtn: !!roleBtn,
    rolePeek: !!rolePeek,
    rolePeekImg: !!rolePeekImg,
    roleBtnImg: !!roleBtnImg
  });
  
  if (roleBtn && rolePeek && rolePeekImg) {
    // Always show verso on the button
    if (roleBtnImg) roleBtnImg.src = '/static/cards/verso.jpg';
    
    function openPeek() {
      console.log('[LG] openPeek called, role:', state.me?.role);
      if (!state.me?.role) {
        console.log('[LG] No role to show');
        return;
      }
      
      // Set the image to the role
      const roleImg = getRoleImage(state.me.role);
      console.log('[LG] Showing role image:', roleImg);
      rolePeekImg.src = roleImg;
      
      // Show the overlay
      rolePeek.classList.add('open');
      rolePeek.setAttribute('aria-hidden', 'false');
      
      fx?.burst({ kind: 'spark', count: 8 });
    }
    
    function closePeek() {
      console.log('[LG] closePeek called');
      rolePeek.classList.remove('open');
      rolePeek.setAttribute('aria-hidden', 'true');
      rolePeekImg.src = '/static/cards/verso.jpg';
    }
    
    // Desktop: show while holding mouse button
    roleBtn.addEventListener('mousedown', (e) => {
      console.log('[LG] mousedown on roleBtn');
      e.preventDefault();
      openPeek();
    });
    
    document.addEventListener('mouseup', () => {
      console.log('[LG] mouseup');
      closePeek();
    });
    
    // Mobile: show while finger is down
    roleBtn.addEventListener('touchstart', (e) => {
      console.log('[LG] touchstart on roleBtn');
      e.preventDefault();
      openPeek();
    }, { passive: false });
    
    roleBtn.addEventListener('touchend', (e) => {
      console.log('[LG] touchend');
      closePeek();
    });
    
    roleBtn.addEventListener('touchcancel', () => {
      console.log('[LG] touchcancel');
      closePeek();
    });
    
    // Hide when page loses focus
    window.addEventListener('blur', closePeek);
    
    // Tap on overlay to close
    rolePeek.addEventListener('click', closePeek);
    rolePeek.addEventListener('touchend', (e) => {
      e.preventDefault();
      closePeek();
    });
  }
  
  // Modal close
  const modalClose = $('modalClose');
  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }
  
  const modal = $('modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });
  }
  
  // Day screen - "go vote" button (optional, server drives this)
  const goVoteBtn = $('goVoteBtn');
  if (goVoteBtn) {
    goVoteBtn.style.display = 'none'; // Hide it - server controls phase transitions
  }
  
  // ============ INITIALIZATION ============
  console.log('[LG] Starting initialization...');
  console.log('[LG] playerId:', config.playerId);
  console.log('[LG] autoJoin:', config.autoJoin);
  console.log('[LG] playerName:', config.playerName);
  
  if (config.playerId) {
    // Already have player ID, reconnect
    console.log('[LG] Reconnecting with existing player ID');
    showScreen('screenWaiting');
    connectWebSocket();
  } else if (config.autoJoin && config.playerName) {
    // Auto-join with name from URL
    console.log('[LG] Auto-joining...');
    joinGame(config.playerName);
  } else {
    // Show join screen
    console.log('[LG] Showing join screen');
    showScreen('screenJoin');
    if (nameInput && config.playerName) {
      nameInput.value = config.playerName;
    }
  }
  
  console.log('[LG] === INITIALIZATION COMPLETE ===');
}