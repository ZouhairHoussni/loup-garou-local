(() => {
  const $ = (id) => document.getElementById(id);

  const root = document.querySelector('.app');
  if (window.LG) LG.applyThemeFromQuery(root);

  const { qs, apiOrigin: API_ORIGIN, wsOrigin: WS_ORIGIN } = LG.parseBackendFromQuery();
  $('backendOrigin').textContent = API_ORIGIN;

  // Bot mode from URL (?bot=1)
  const BOT = qs.get('bot') === '1';
  $('botPill').textContent = BOT ? 'OUI' : 'NON';

  // FX
  const fx = window.LGFX?.init($('fxCanvas'), { mode: 'night' });

  // Optional sound FX (enable with ?sound=1)
  const sfx = window.LGSFX?.fromQuery?.() || null;

  // --- WS status dot
  const wsDot = $('wsDot');
  const setDot = (ok) => {
    wsDot.style.background = ok ? 'rgba(34,197,94,.95)' : 'rgba(239,68,68,.95)';
    wsDot.style.boxShadow = ok
      ? '0 0 0 2px rgba(0,0,0,.25) inset, 0 0 18px rgba(34,197,94,.35)'
      : '0 0 0 2px rgba(0,0,0,.25) inset, 0 0 18px rgba(239,68,68,.35)';
  };
  setDot(false);

  // --- Modal helpers
  const modal = $('modal');
  const modalTitle = $('modalTitle');
  const modalBody = $('modalBody');
  const closeModal = () => { modal.style.display = 'none'; };
  const openModal = (title, html) => {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.style.display = 'block';
    fx?.burst({ kind: 'magic', count: 22 });
  };
  $('modalClose').addEventListener('click', closeModal);
  $('modalOk').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // --- Log
  const logEl = $('log');
  function appendLog(line){
    logEl.textContent += line + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  // --- Role card
  const roleCardWrap = $('roleCardWrap');
  const roleCard = $('roleCard');
  const spot = $('spot');
  const roleBackImg = $('roleBackImg');
  const roleFrontImg = $('roleFrontImg');
  const roleTitle = $('roleTitle');
  const flipBtn = $('flipBtn');

  function setRoleCard(roleKey){
    // Back: verso
    LG.setImgWithFallback(roleBackImg, LG.VERSO.primary, LG.VERSO.fallback);

    // Front: role image
    const files = LG.cardForRole(roleKey);
    LG.setImgWithFallback(roleFrontImg, files.primary, files.fallback);

    roleTitle.textContent = LG.roleLabel(roleKey);
  }

  function setCardFlipped(on){
    roleCard.classList.toggle('is-revealed', !!on);
    spot.classList.toggle('is-on', !!on);
    if (on) fx?.burst({ kind: 'spark', count: 16 });
  }

  roleCard.addEventListener('click', () => {
    sfx?.click?.();
    setCardFlipped(!roleCard.classList.contains('is-revealed'));
  });
  roleCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      sfx?.click?.();
      setCardFlipped(!roleCard.classList.contains('is-revealed'));
    }
  });
  flipBtn.addEventListener('click', () => {
    sfx?.click?.();
    setCardFlipped(!roleCard.classList.contains('is-revealed'));
  });

  // --- Join
  const joinCard = $('joinCard');
  const nameInput = $('nameInput');
  const joinBtn = $('joinBtn');

  let playerId = qs.get('player_id') || '';
  let playerName = qs.get('name') || '';
  const AUTOJOIN = qs.get('autojoin') === '1';

  $('playerName').textContent=playerName||'—';

  function showJoinIfNeeded(){
    if (playerId) {
      joinCard.style.display = 'none';
      return;
    }
    joinCard.style.display = 'block';
    nameInput.value = playerName || '';
    nameInput.focus();
  }

  async function join(name){
    const r = await fetch(`${API_ORIGIN}/api/join`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name })
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'join failed');
    playerId = j.player_id;
    playerName = name;

    // Update URL so refresh keeps the session
    const next = new URL(location.href);
    next.searchParams.set('player_id', playerId);
    next.searchParams.set('name', playerName);
    history.replaceState({}, '', next.toString());
    $('playerIdPill').textContent = `ID: ${playerId}`;
    $('playerName').textContent = playerName;
    joinCard.style.display = 'none';
    fx?.burst({ kind:'magic', count: 28 });
  }

  joinBtn.addEventListener('click', async () => {
    try{
      const n = (nameInput.value || '').trim();
      if (!n) return alert('Veuillez entrer un nom.');
      sfx?.confirm?.();
      await join(n);
      connect();
    }catch(e){
      alert(String(e));
    }
  });

  // If name in query and autojoin, join immediately.
  (async () => {
    showJoinIfNeeded();
    if (!playerId && AUTOJOIN && playerName){
      try{
        await join(playerName);
      }catch(e){
        console.warn(e);
      }
    }
    if (playerId) {
      $('playerIdPill').textContent = `ID: ${playerId}`;
      roleCardWrap.style.display = 'block';
      connect();
    }
  })();

  // --- Action UI
  const actionCard = $('actionCard');
  const actionUI = $('actionUI');
  const actionHint = $('actionHint');
  const submitActionBtn = $('submitActionBtn');

  const voteCard = $('voteCard');
  const voteSelect = $('voteSelect');
  const voteBtn = $('voteBtn');
  const voteStatus = $('voteStatus');

  let currentPhase = '—';
  let lastPrivate = null;


  // --- BOT helpers (auto vote + auto actions)
  const bot = {
    voteKey: null,
    acted: new Set(),
    rand(min, max){ return Math.floor(min + Math.random() * (max - min + 1)); },
    pick(arr){ return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; },
    sleep(ms){ return new Promise(res => setTimeout(res, ms)); },
  };

  async function botMaybeVote(state){
    if (!BOT) return;
    if (!state || state.phase !== 'VOTE') return;
    if (!state.me || !state.me.alive) return;

    const key = state.timers?.phase_ends_at || null;
    if (!key || bot.voteKey === key) return;
    bot.voteKey = key;

    const targets = (state.alive || []).filter(p => p.id !== playerId);
    const t = bot.pick(targets);
    if (!t) return;

    await bot.sleep(bot.rand(450, 1200));
    try{
      const r = await fetch(`${API_ORIGIN}/api/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter_id: playerId, target_id: t.id })
      });
      const j = await r.json();
      if (j.ok) {
        voteStatus.textContent = 'Vote envoyé (bot).';
        fx?.burst({ kind: 'spark', count: 14 });
      }
    }catch{}
  }

  async function botMaybeAction(step, deadline){
    if (!BOT) return;
    if (!lastPrivate || !lastPrivate.me || !lastPrivate.me.alive) return;
    if (lastPrivate.phase !== 'NIGHT') return;

    const key = `${step}:${deadline || ''}`;
    if (bot.acted.has(key)) return;
    bot.acted.add(key);

    const targets = (lastPrivate.alive || []).filter(p => p.id !== playerId);
    const me = lastPrivate.me;

    let payload = null;
    if (step === 'WOLVES' && me.role === 'werewolf') {
      const t = bot.pick(targets); if (!t) return;
      payload = { step: 'WOLVES', data: { target: t.id } };
    } else if (step === 'SEER' && me.role === 'seer') {
      const t = bot.pick(targets); if (!t) return;
      payload = { step: 'SEER', data: { target: t.id } };
    } else if (step === 'WITCH' && me.role === 'witch') {
      const canHeal = !me.witch_heal_used;
      const canPoison = !me.witch_poison_used;
      const heal = canHeal ? (Math.random() < 0.5) : false;
      const poisonTarget = (canPoison && Math.random() < 0.35) ? (bot.pick(targets)?.id || null) : null;
      payload = { step: 'WITCH', data: { heal, poison_target: poisonTarget } };
    } else if (step === 'CUPID' && me.role === 'cupid') {
      if ((lastPrivate.alive || []).length < 2) return;
      const pool = (lastPrivate.alive || []).map(p => p.id);
      const a = bot.pick(pool);
      const b = bot.pick(pool.filter(x => x !== a));
      if (!a || !b) return;
      payload = { step: 'CUPID', data: { targets: [a, b] } };
    } else {
      return;
    }

    await bot.sleep(bot.rand(500, 1400));
    try{
      const r = await fetch(`${API_ORIGIN}/api/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, ...payload })
      });
      const j = await r.json();
      if (j.ok) fx?.burst({ kind: 'magic', count: 16 });
    }catch{}
  }

  function setNightMode(isNight){
    root.classList.toggle('is-night', isNight);
    fx?.setMode(isNight ? 'night' : 'day');
  }

  function applyPublic(state){
    if (!state) return;
    const phase = state.phase || '—';
    if (phase !== currentPhase){
      currentPhase = phase;
      fx?.burst({ kind: phase === 'NIGHT' ? 'magic' : 'ember', count: 18 });
    }
    $('phase').textContent = phase;

    const secs = state.timers?.seconds_left;
    $('timer').textContent = (secs === null || secs === undefined) ? '—' : `${secs}s`;
    setNightMode(phase === 'NIGHT');

    if (phase !== 'NIGHT') { window.__pendingStep = null; window.__pendingDeadline = null; window.__witchCtx = null; }

    renderAliveDead(state.alive || [], state.dead || []);
  }

  function applyPrivate(state){
    if (!state || !state.me) return;
    lastPrivate = state;
    const me = state.me;

    // Server tells each player if they currently have a night action pending
    if (state.pending_step) {
      window.__pendingStep = state.pending_step;
      window.__pendingDeadline = state.pending_deadline || null;
    } else {
      window.__pendingStep = null;
      window.__pendingDeadline = null;
    }
    if (state.witch_ctx) { window.__witchCtx = state.witch_ctx; }

    $('playerName').textContent = me.name || '—';
    const t = me.name || 'Joueur';
    const ht = $('headerTitle');
    if (ht) ht.textContent = t;
    document.title = `Loup-Garou — ${t}`;

    $('aliveText').textContent = me.alive ? 'Vivant' : 'Mort';
    const roleKey = me.role || null;
    $('roleText').textContent = me.role_fr || LG.roleLabel(roleKey);

    roleCardWrap.style.display = 'block';
    setRoleCard(roleKey);

    // Default: show back unless user already flipped
    if (!roleCard.classList.contains('is-revealed')) setCardFlipped(false);

    // Lover reveal (only once)
    if (me.lover_id && state.lover_name && !window.__loverShown){
      window.__loverShown = true;
      openModal('Le Cupidon — Ton amoureux(se)', `
        <div class="reveal-hero">
          <div class="muted">Ton amoureux(se) est :</div>
          <div style="font-size:22px;font-weight:950;margin-top:8px;">${LG.escapeHtml(state.lover_name)}</div>
          <div class="hint inline">Si l’un meurt, l’autre meurt aussi (règle classique).</div>
        </div>
      `);
    }

    // Action steps
    updateActionUI(state);
    updateVoteUI(state);
    botMaybeVote(state);
    botMaybeAction(window.__pendingStep, window.__pendingDeadline);
  }

  function renderAliveDead(alive, dead){
    const aliveEl = $('aliveList');
    const deadEl = $('deadList');

    aliveEl.innerHTML = '';
    if (!alive.length) aliveEl.innerHTML = '<div class="muted">—</div>';
    for (const p of alive){
      const row = document.createElement('div');
      row.className = 'pillItem player';
      row.innerHTML = `
        <img class="miniRole" alt="card" src="${LG.CARD_BASE}${LG.VERSO.fallback}" />
        <div>
          <div class="name">${LG.escapeHtml(p.name)}</div>
          <div class="tag mono">${LG.escapeHtml(p.id)}</div>
        </div>
      `;
      // Load nicer verso (jpg if present)
      const img = row.querySelector('img');
      LG.setImgWithFallback(img, LG.VERSO.primary, LG.VERSO.fallback);
      aliveEl.appendChild(row);
    }

    deadEl.innerHTML = '';
    if (!dead.length) deadEl.innerHTML = '<div class="muted">—</div>';
    for (const p of dead){
      const row = document.createElement('div');
      row.className = 'pillItem player is-dead';
      const files = LG.cardForRole(p.role);
      const roleLabel = p.role_fr || LG.roleLabel(p.role);
      row.innerHTML = `
        <img class="miniRole" alt="role" src="${LG.CARD_BASE}${files.fallback}" />
        <div>
          <div class="name">${LG.escapeHtml(p.name)}</div>
          <div class="tag">${LG.escapeHtml(roleLabel)}</div>
        </div>
      `;
      const img = row.querySelector('img');
      LG.setImgWithFallback(img, files.primary, files.fallback);
      deadEl.appendChild(row);
    }
  }

  function updateVoteUI(state){
    const phase = state.phase;
    if (phase !== 'VOTE'){
      voteCard.style.display = 'none';
      return;
    }
    voteCard.style.display = 'block';
    const alive = (state.alive || []).filter(p => p.id !== playerId);
    voteSelect.innerHTML = '';
    for (const p of alive){
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      voteSelect.appendChild(opt);
    }
    if (!alive.length){
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Aucune cible';
      voteSelect.appendChild(opt);
    }
  }

  voteBtn.addEventListener('click', async () => {
    if (!playerId) return;
    const target = voteSelect.value;
    if (!target) return;
    try{
      sfx?.click?.();
      voteStatus.textContent = 'Vote en cours…';
      const r = await fetch(`${API_ORIGIN}/api/vote`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ voter_id: playerId, target_id: target })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'vote failed');
      voteStatus.textContent = 'Vote envoyé.';
      sfx?.confirm?.();
      fx?.burst({ kind:'spark', count: 14 });
    }catch(e){
      voteStatus.textContent = 'Échec du vote.';
      alert(String(e));
    }
  });

  // --- Role actions UI
  let actionSelection = null;

  function updateActionUI(state){
    const me = state?.me;
    const phase = state?.phase;

    actionSelection = null;
    submitActionBtn.style.display = 'none';
    actionUI.innerHTML = '';
    actionCard.style.display = 'none';

    if (!me || !me.alive) return;
    if (phase !== 'NIGHT') return;

    // Only show UI when server is actively requesting an action.
    const pendingStep = window.__pendingStep || null; // e.g. 'WOLVES', 'SEER', 'WITCH', 'CUPID'
    if (!pendingStep) return;

    const aliveTargets = (state.alive || []).filter(p => p.id !== playerId);
    // ---- WOLVES (propositions + majorité à la fin)
    if (pendingStep === 'WOLVES' && me.role === 'werewolf'){
      actionCard.style.display = 'block';
      // NOTE: use double quotes to avoid breaking JS parsing with apostrophes.
      actionHint.textContent = "Les Loups-Garous proposent une victime. Essayez d'atteindre l'unanimité ; sinon, la majorité l'emporte à la fin du temps.";

      const wolvesTeam = (state.wolves_team || []).map(w => w.id);
      const aliveTargets = (state.alive || []).filter(p => !wolvesTeam.includes(p.id));

      const sel = document.createElement('select');
      for (const p of aliveTargets){
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      }
      if (!aliveTargets.length){
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Aucune cible';
        sel.appendChild(opt);
      }

      // Keep last choice across state refreshes
      if (window.__wolfChoice && [...sel.options].some(o => o.value === window.__wolfChoice)){
        sel.value = window.__wolfChoice;
      }
      sel.addEventListener('change', () => { window.__wolfChoice = sel.value; });

      const status = document.createElement('div');
      status.className = 'small';
      status.style.marginTop = '10px';

      const suggestions = document.createElement('div');
      suggestions.className = 'pillList';
      suggestions.style.marginTop = '10px';

      function renderSuggestions(){
        const votes = state.wolves_votes || {};
        suggestions.innerHTML = '';

        // per-wolf line
        const team = state.wolves_team || [];
        const byId = new Map((state.alive || []).map(p => [p.id, p.name]));
        const tally = {};
        let filled = 0;
        for (const w of team){
          const t = votes[w.id] || null;
          if (t) { tally[t] = (tally[t]||0)+1; filled += 1; }
          const pill = document.createElement('div');
          pill.className = 'pillItem';
          pill.innerHTML = `<div><div class="name">${LG.escapeHtml(w.name)}</div><div class="tag">${t ? LG.escapeHtml(byId.get(t) || t) : '—'}</div></div>`;
          suggestions.appendChild(pill);
        }

        const total = team.length || 0;
        const targets = Object.keys(tally);
        const unanimous = total > 0 && filled === total && targets.length === 1;
        if (unanimous){
          status.textContent = `Unanimité : ${byId.get(targets[0]) || targets[0]} ✓`;
        } else if (targets.length){
          const maxv = Math.max(...Object.values(tally));
          const leaders = targets.filter(t => tally[t] === maxv);
          if (leaders.length === 1){
            status.textContent = `Tendance : ${byId.get(leaders[0]) || leaders[0]} (${maxv}/${total})`;
          } else {
            status.textContent = `Égalité (${maxv}/${total}) — continuez à vous coordonner.`;
          }
        } else {
          status.textContent = 'En attente des propositions des loups…';
        }
      }
      renderSuggestions();

      actionUI.appendChild(sel);
      actionUI.appendChild(status);
      actionUI.appendChild(suggestions);

      actionSelection = () => ({ step: 'WOLVES', data: { target: sel.value } });
      submitActionBtn.textContent = 'Proposer';
      submitActionBtn.style.display = 'block';
      return;
    }

    // ---- SEER
    if (pendingStep === 'SEER' && me.role === 'seer'){
      actionCard.style.display = 'block';
      actionHint.textContent = 'La Voyante révèle le rôle d’un joueur.';

      const sel = document.createElement('select');
      for (const p of aliveTargets){
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      }
      actionUI.appendChild(sel);
      actionSelection = () => ({ step: 'SEER', data: { target: sel.value } });
      submitActionBtn.style.display = 'block';
      return;
    }

    // ---- WITCH
    if (pendingStep === 'WITCH' && me.role === 'witch'){
      actionCard.style.display = 'block';
      const canHeal = !me.witch_heal_used;
      const canPoison = !me.witch_poison_used;

      const victimName = window.__witchCtx?.victim_name || window.__witchCtx?.wolves_victim_name || null;
      const victimLine = victimName ? `Victime (ciblée par les Loups) : ${victimName}.` : 'Victime (ciblée par les Loups) : inconnue.';
      actionHint.textContent = `La Sorcière agit. ${victimLine}`;

      const row = document.createElement('div');
      row.className = 'row';

      const healBtn = document.createElement('button');
      healBtn.className = 'btn btn-secondary';
      healBtn.textContent = canHeal ? 'Sauver la victime (potion de vie)' : 'Potion de vie utilisée';
      healBtn.disabled = !canHeal;

      const poisonSel = document.createElement('select');
      poisonSel.disabled = !canPoison;
      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = 'Empoisonner (optionnel)';
      poisonSel.appendChild(opt0);
      for (const p of aliveTargets){
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        poisonSel.appendChild(opt);
      }

      row.appendChild(healBtn);
      row.appendChild(poisonSel);
      actionUI.appendChild(row);

      let heal = false;
      healBtn.addEventListener('click', () => {
        heal = !heal;
        healBtn.classList.toggle('is-on', heal);
        fx?.burst({ kind:'magic', count: 14 });
      });

      actionSelection = () => ({
        step: 'WITCH',
        data: {
          heal: canHeal ? !!heal : false,
          poison_target: canPoison ? (poisonSel.value || null) : null,
        }
      });

      submitActionBtn.style.display = (canHeal || canPoison) ? 'block' : 'none';
      return;
    }

    // ---- CUPID
    if (pendingStep === 'CUPID' && me.role === 'cupid'){
      actionCard.style.display = 'block';
      actionHint.textContent = 'Le Cupidon désigne deux amoureux. Ils ne peuvent pas être la même personne.';

      // Preserve selections across state refreshes
      const existingSel1 = actionUI.querySelector('#cupidSel1');
      const existingSel2 = actionUI.querySelector('#cupidSel2');
      const prevVal1 = existingSel1?.value || window.__cupidChoice1 || '';
      const prevVal2 = existingSel2?.value || window.__cupidChoice2 || '';

      // Only rebuild if not already present
      if (!existingSel1 || !existingSel2) {
        const alivePlayers = (state.alive || []);

        const sel1 = document.createElement('select');
        sel1.id = 'cupidSel1';
        const sel2 = document.createElement('select');
        sel2.id = 'cupidSel2';

        // Add placeholder option
        const ph1 = document.createElement('option');
        ph1.value = ''; ph1.textContent = '— Premier amoureux —';
        sel1.appendChild(ph1);
        const ph2 = document.createElement('option');
        ph2.value = ''; ph2.textContent = '— Deuxième amoureux —';
        sel2.appendChild(ph2);

        for (const p of alivePlayers){
          const o1 = document.createElement('option');
          o1.value = p.id; o1.textContent = p.name;
          const o2 = document.createElement('option');
          o2.value = p.id; o2.textContent = p.name;
          sel1.appendChild(o1);
          sel2.appendChild(o2);
        }

        // Restore previous selections
        if (prevVal1 && [...sel1.options].some(o => o.value === prevVal1)) {
          sel1.value = prevVal1;
        }
        if (prevVal2 && [...sel2.options].some(o => o.value === prevVal2)) {
          sel2.value = prevVal2;
        }

        // Function to update disabled state
        const updateDisabled = () => {
          const v1 = sel1.value;
          const v2 = sel2.value;
          // Disable option in sel2 if it matches sel1
          for (const opt of sel2.options) {
            opt.disabled = (opt.value && opt.value === v1);
          }
          // Disable option in sel1 if it matches sel2
          for (const opt of sel1.options) {
            opt.disabled = (opt.value && opt.value === v2);
          }
          // Save choices
          window.__cupidChoice1 = v1;
          window.__cupidChoice2 = v2;
        };

        sel1.addEventListener('change', updateDisabled);
        sel2.addEventListener('change', updateDisabled);

        // Prevent dropdown from closing on mousedown (stop event bubbling)
        sel1.addEventListener('mousedown', (e) => e.stopPropagation());
        sel2.addEventListener('mousedown', (e) => e.stopPropagation());

        updateDisabled();

        const row = document.createElement('div');
        row.className = 'row';
        row.appendChild(sel1);
        row.appendChild(sel2);

        // Error message container
        const errorDiv = document.createElement('div');
        errorDiv.id = 'cupidError';
        errorDiv.className = 'small';
        errorDiv.style.color = 'var(--red, #ef4444)';
        errorDiv.style.marginTop = '8px';

        actionUI.innerHTML = '';
        actionUI.appendChild(row);
        actionUI.appendChild(errorDiv);
      }

      actionSelection = () => {
        const s1 = actionUI.querySelector('#cupidSel1');
        const s2 = actionUI.querySelector('#cupidSel2');
        const errDiv = actionUI.querySelector('#cupidError');
        if (!s1 || !s2) return null;
        
        if (!s1.value || !s2.value) {
          if (errDiv) errDiv.textContent = 'Veuillez sélectionner deux joueurs.';
          return null;
        }
        if (s1.value === s2.value) {
          if (errDiv) errDiv.textContent = 'Les deux amoureux doivent être différents !';
          return null;
        }
        if (errDiv) errDiv.textContent = '';
        return { step: 'CUPID', data: { targets: [s1.value, s2.value] } };
      };
      submitActionBtn.style.display = 'block';
      return;
    }
  }

  submitActionBtn.addEventListener('click', async () => {
    if (!playerId || !actionSelection) return;
    const payload = actionSelection();
    if (!payload) return;
    try{
      sfx?.click?.();
      const r = await fetch(`${API_ORIGIN}/api/action`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ player_id: playerId, ...payload })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'action failed');
      sfx?.confirm?.();
      fx?.burst({ kind:'magic', count: 22 });
      submitActionBtn.textContent = 'Validé ✓';
      setTimeout(() => (submitActionBtn.textContent = 'Valider'), 900);
    }catch(e){
      alert(String(e));
    }
  });

  // --- WebSocket
  let ws;
  function connect(){
    if (!playerId){ showJoinIfNeeded(); return; }
    const url = `${WS_ORIGIN}/ws?client=player&player_id=${encodeURIComponent(playerId)}`;
    ws = new WebSocket(url);

    ws.onopen = () => { setDot(true); fx?.burst({ kind:'magic', count: 18 }); };
    ws.onclose = () => { setDot(false); setTimeout(connect, 700); };
    ws.onerror = () => { setDot(false); };

    ws.onmessage = (ev) => {
      let msg;
      try{ msg = JSON.parse(ev.data); }catch{ return; }

      if (msg.type === 'PUBLIC_STATE'){
        applyPublic(msg.data);
      } else if (msg.type === 'PRIVATE_STATE'){
        applyPrivate(msg.data);
      } else if (msg.type === 'NARRATOR_LINE'){
        appendLog(msg.line);
      } else if (msg.type === 'SEER_RESULT'){
        const targetName = msg.target_name || '—';
        const roleKey = msg.role || null;
        const roleFr = msg.role_fr || LG.roleLabel(roleKey);
        const files = LG.cardForRole(roleKey);
        openModal('La Voyante — Révélation', `
          <div class="reveal-hero">
            <div class="muted">${LG.escapeHtml(targetName)} est :</div>
            <div style="font-size:22px;font-weight:950;margin-top:8px;">${LG.escapeHtml(roleFr)}</div>
            <div style="margin-top:12px;display:grid;place-items:center;">
              <div class="reveal-card is-flipped" style="width:min(320px,92%);height:min(320px,92vw);">
                <div class="reveal-face"><img class="roleImg" src="${LG.CARD_BASE}${LG.VERSO.fallback}" alt="verso" /></div>
                <div class="reveal-face face-front">
                  <img id="seerRoleImg" class="roleImg" alt="role" />
                </div>
              </div>
            </div>
          </div>
        `);
        // set image after insertion
        setTimeout(() => {
          const img = document.getElementById('seerRoleImg');
          if (img) LG.setImgWithFallback(img, files.primary, files.fallback);
        }, 0);
      } else if (msg.type === 'ACTION_REQUEST') {
        window.__pendingStep = msg.step || null;
        window.__pendingDeadline = msg.deadline || null;
        // force refresh of action UI if we already have private state
        if (lastPrivate) updateActionUI(lastPrivate);
        botMaybeAction(window.__pendingStep, window.__pendingDeadline);
      } else if (msg.type === 'WITCH_CONTEXT') {
        window.__witchCtx = { wolves_victim_id: msg.wolves_victim_id, wolves_victim_name: msg.wolves_victim_name };
        if (lastPrivate) updateActionUI(lastPrivate);
            } else if (msg.type === 'GAME_OVER'){
        const w = msg.winner_fr || msg.winner || '—';
        openModal('Fin de partie', `<div class="reveal-hero"><div style="font-size:22px;font-weight:950;">Victoire : ${LG.escapeHtml(w)}</div></div>`);
      } else if (msg.type === 'RESET'){
        logEl.textContent = '';
        voteStatus.textContent = '';
      }
    };
  }
})();