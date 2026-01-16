(() => {
  const $ = (id) => document.getElementById(id);

  const root = document.querySelector('.app');
  if (window.LG) LG.applyThemeFromQuery(root);

  const { qs, host, port, apiOrigin: API_ORIGIN, wsOrigin: WS_ORIGIN } = LG.parseBackendFromQuery();
  $('backendOrigin').textContent = API_ORIGIN;

  const fx = window.LGFX?.init($('fxCanvas'), { mode: 'night' });
  const sfx = window.LGSFX?.fromQuery?.() || null;

  const logEl = $('log');
  function appendLog(line){
    logEl.textContent += line + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Buttons
  const startBtn = $('startBtn');
  const resetBtn = $('resetBtn');
  const copyJoinBtn = $('copyJoinBtn');

  startBtn?.addEventListener('click', async () => {
    try{
      sfx?.confirm?.();
      const r = await fetch(`${API_ORIGIN}/api/start`, { method:'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'start failed');
      fx?.burst({ kind:'magic', count: 26 });
    }catch(e){ alert(String(e)); }
  });
  resetBtn?.addEventListener('click', async () => {
    if (!confirm('Réinitialiser la partie ?')) return;
    try{
      sfx?.warn?.();
      const r = await fetch(`${API_ORIGIN}/api/reset`, { method:'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'reset failed');
      logEl.textContent = '';
      fx?.burst({ kind:'ember', count: 22 });
    }catch(e){ alert(String(e)); }
  });

  copyJoinBtn?.addEventListener('click', async () => {
    // Share a working URL for players (same backend host/port)
    const joinUrl = `${location.protocol}//${host}:${port}/player/?autojoin=1`;
    try{
      sfx?.click?.();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinUrl);
        appendLog(`🔗 Lien joueur copié : ${joinUrl}`);
      } else {
        prompt('Copiez le lien joueur :', joinUrl);
      }
      fx?.burst({ kind: 'spark', count: 14 });
    } catch {
      prompt('Copiez le lien joueur :', joinUrl);
    }
  });

  let currentPhase = '—';

  function setNightMode(isNight){
    root.classList.toggle('is-night', isNight);
    fx?.setMode(isNight ? 'night' : 'day');
  }

  function renderPlayers(listEl, players, { revealed } = { revealed: false }){
    listEl.innerHTML = '';
    if (!players.length){
      listEl.innerHTML = '<div class="muted">—</div>';
      return;
    }
    for (const p of players){
      const item = document.createElement('div');
      item.className = 'listItem';
      const img = document.createElement('img');
      img.className = 'miniRole';
      img.alt = revealed ? 'role' : 'verso';
      if (revealed && p.role){
        const files = LG.cardForRole(p.role);
        LG.setImgWithFallback(img, files.primary, files.fallback);
      } else {
        LG.setImgWithFallback(img, LG.VERSO.primary, LG.VERSO.fallback);
      }

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '10px';
      left.appendChild(img);

      const txt = document.createElement('div');
      txt.innerHTML = `<div class="name">${LG.escapeHtml(p.name)}</div>` +
        `<div class="meta mono">${LG.escapeHtml(p.id)}</div>`;
      left.appendChild(txt);

      const right = document.createElement('div');
      if (revealed) {
        const roleLabel = p.role_fr || LG.roleLabel(p.role);
        right.innerHTML = `<div class="meta">${LG.escapeHtml(roleLabel || '—')}</div>`;
      } else {
        right.innerHTML = `<div class="meta">Vivant</div>`;
      }

      item.appendChild(left);
      item.appendChild(right);
      listEl.appendChild(item);
    }
  }

  function renderVotes(voteBoxEl, alive, dead, state){
    voteBoxEl.innerHTML = '';

    const vr = window.__voteResult || null;

    if (state.phase !== 'VOTE' && state.phase !== 'RESULT'){
      voteBoxEl.innerHTML = '<div class="muted">Pas de vote pour cette phase.</div>';
      return;
    }

    if (!vr) {
      voteBoxEl.innerHTML = '<div class="muted">En attente des résultats de vote…</div>';
      return;
    }

    // Build bars from tally
    // Backend sends `tally` as an array: [{id,name,votes}, ...]
    // (Keep compatibility if it ever becomes an object map.)
    const rows = Array.isArray(vr.tally)
      ? vr.tally.map(r => ({ id: r.id, name: r.name, count: Number(r.votes ?? r.count) || 0 }))
      : Object.entries(vr.tally || {}).map(([id, count]) => ({ id, name: null, count: Number(count) || 0 }));

    rows.sort((a,b) => b.count - a.count);

    const total = rows.reduce((s,r) => s + r.count, 0) || 1;
    const nameById = new Map([...(alive||[]), ...(dead||[])].map(p => [p.id, p.name]));

    const box = document.createElement('div');
    box.style.display = 'grid';
    box.style.gap = '10px';

    for (const r of rows) {
      const pct = Math.round((r.count / total) * 100);
      const name = r.name || nameById.get(r.id) || r.id;
      const row = document.createElement('div');
      row.innerHTML = `
        <div class="kv">
          <div><b>${LG.escapeHtml(name)}</b> <span class="muted mono">(${LG.escapeHtml(r.id)})</span></div>
          <div class="muted"><b>${r.count}</b> vote(s) • ${pct}%</div>
        </div>
        <div class="bar"><div class="fill" style="width:${pct}%;"></div></div>
      `;
      box.appendChild(row);
    }

    voteBoxEl.appendChild(box);

    // Eliminated card
    if (vr.eliminated) {
      const elim = vr.eliminated;
      const roleLabel = elim.role_fr || LG.roleLabel(elim.role);
      const files = LG.cardForRole(elim.role);
      const card = document.createElement('div');
      card.className = 'resultCard';
      card.innerHTML = `
        <div class="resultTop">
          <div>
            <div class="muted">Éliminé</div>
            <div style="font-size:18px;font-weight:950;">${LG.escapeHtml(elim.name)}</div>
            <div class="muted">${LG.escapeHtml(roleLabel)}</div>
          </div>
          <img class="miniRole" id="elimImg" alt="role" />
        </div>
      `;
      voteBoxEl.appendChild(card);
      setTimeout(() => {
        const img = document.getElementById('elimImg');
        if (img) LG.setImgWithFallback(img, files.primary, files.fallback);
      }, 0);
    }

    if (vr.ties && vr.ties.length) {
      const t = document.createElement('div');
      t.className = 'muted';
      t.textContent = `Égalité: ${vr.ties.length} joueur(s) — nouveau vote ou règle maison.`;
      voteBoxEl.appendChild(t);
    }
  }

  function applyState(state){
    if (!state) return;
    window.__lastPublicState = state;
    const phase = state.phase || '—';
    $('phase').textContent = phase;
    $('aliveCount').textContent = String((state.alive || []).length);
    $('deadCount').textContent = String((state.dead || []).length);

    const secs = state.timers?.seconds_left;
    $('timer').textContent = (secs === null || secs === undefined) ? '—' : `${secs}s`;

    if (phase !== currentPhase){
      currentPhase = phase;
      fx?.burst({ kind: phase === 'NIGHT' ? 'magic' : 'ember', count: 20 });
    }
    setNightMode(phase === 'NIGHT');

    renderPlayers($('aliveList'), state.alive || [], { revealed: false });
    renderPlayers($('deadList'), state.dead || [], { revealed: true });
    renderVotes($('voteBox'), state.alive || [], state.dead || [], state);

    if (phase === 'GAME_OVER' && state.winner){
      fx?.burst({ kind:'magic', count: 40 });
      const w = state.winner === 'villagers' ? 'Les Villageois'
        : state.winner === 'werewolves' ? 'Les Loups-Garous'
        : state.winner === 'nobody' ? 'Personne'
        : state.winner;
      appendLog(`🏁 Victoire : ${w}`);
    }
  }

  // WebSocket
  let ws;
  function connect(){
    const url = `${WS_ORIGIN}/ws?client=tv`;
    ws = new WebSocket(url);
    $('ws').textContent = 'connexion…';

    ws.onopen = () => {
      $('ws').textContent = 'connecté';
      fx?.burst({ kind:'magic', count: 16 });
    };
    ws.onclose = () => {
      $('ws').textContent = 'déconnecté';
      setTimeout(connect, 700);
    };
    ws.onerror = () => { $('ws').textContent = 'erreur'; };

    ws.onmessage = (ev) => {
      let msg;
      try{ msg = JSON.parse(ev.data); }catch{ return; }
      if (msg.type === 'PUBLIC_STATE'){
        applyState(msg.data);
      } else if (msg.type === 'VOTE_RESULT'){
        window.__voteResult = msg;
        fx?.burst({ kind:'spark', count: 20 });
        // refresh immediately
        const last = window.__lastPublicState;
        if (last) renderVotes($('voteBox'), last.alive || [], last.dead || [], last);
      } else if (msg.type === 'NARRATOR_LINE'){
        window.__narratorLines = window.__narratorLines || [];
        window.__narratorLines.push(msg.line);
        window.__narratorLines = window.__narratorLines.slice(-200);
        appendLog(msg.line);
      } else if (msg.type === 'RESET'){
        window.__narratorLines = [];
        window.__voteResult = null;
        logEl.textContent = '';
        $('voteBox').innerHTML = '<div class="muted">Aucun vote pour l’instant.</div>';
      }
    };
  }

  connect();
})();
