from __future__ import annotations

import asyncio
import json
import random
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware


class Role(str, Enum):
    VILLAGER = "villager"
    WEREWOLF = "werewolf"
    SEER = "seer"
    WITCH = "witch"
    CUPID = "cupid"


ROLE_FR = {
    Role.VILLAGER: "Le Villageois",
    Role.WEREWOLF: "Le Loup-Garou",
    Role.SEER: "La Voyante",
    Role.WITCH: "La Sorcière",
    Role.CUPID: "Le Cupidon",
}

WINNER_FR = {
    "villagers": "Les Villageois",
    "werewolves": "Les Loups-Garous",
    "nobody": "Personne",
}

WEREWOLF_COUNT_RANGES = {
    (5, 7): 1,
    (8, 11): 2,
    (12, 15): 3,
    (16, 99): 4,
}

UNIQUE_ROLES = {Role.SEER, Role.WITCH, Role.CUPID}


def get_werewolf_count(player_count: int) -> int:
    for (min_p, max_p), wolf_count in WEREWOLF_COUNT_RANGES.items():
        if min_p <= player_count <= max_p:
            return wolf_count
    return 1


class Phase(str, Enum):
    LOBBY = "LOBBY"
    NIGHT = "NIGHT"
    DAY = "DAY"
    VOTE = "VOTE"
    RESULT = "RESULT"
    GAME_OVER = "GAME_OVER"


@dataclass
class Player:
    id: str
    name: str
    alive: bool = True
    role: Optional[Role] = None
    lover_id: Optional[str] = None
    witch_heal_used: bool = False
    witch_poison_used: bool = False


@dataclass
class Timers:
    phase_ends_at: Optional[float] = None
    seconds_left: Optional[int] = None


@dataclass
class ActionInbox:
    step: str = ""
    deadline: float = 0.0
    received: Dict[str, Any] = field(default_factory=dict)
    event: asyncio.Event = field(default_factory=asyncio.Event)


@dataclass
class VoteBox:
    deadline: float = 0.0
    votes: Dict[str, str] = field(default_factory=dict)
    event: asyncio.Event = field(default_factory=asyncio.Event)


@dataclass
class GameState:
    phase: Phase = Phase.LOBBY
    night_count: int = 0
    day_count: int = 0
    narrator: List[str] = field(default_factory=list)
    started: bool = False
    winner: Optional[str] = None
    wolves_victim: Optional[str] = None
    witch_heal: bool = False
    witch_poison_target: Optional[str] = None
    pending: ActionInbox = field(default_factory=ActionInbox)
    vote_box: VoteBox = field(default_factory=VoteBox)
    timers: Timers = field(default_factory=Timers)


class WSClientType(str, Enum):
    TV = "tv"
    PLAYER = "player"


@dataclass(eq=False)
class WSClient:
    websocket: WebSocket
    client_type: WSClientType
    player_id: Optional[str] = None


class Game:
    def __init__(self) -> None:
        self.state = GameState()
        self.players: Dict[str, Player] = {}
        self._lock = asyncio.Lock()
        self._clients: Set[WSClient] = set()
        self._runner_task: Optional[asyncio.Task] = None

        # Configurable timers
        self.T_DISCUSS = 15
        self.T_VOTE = 25
        self.T_NIGHT_STEP = 22
        self.T_RESULT = 5
        
        # Configurable roles
        self.use_seer = True
        self.use_witch = True
        self.use_cupid = True
        self.use_hunter = False

    def _alive_ids(self) -> List[str]:
        return [pid for pid, p in self.players.items() if p.alive]

    def _alive_players(self) -> List[Player]:
        return [p for p in self.players.values() if p.alive]

    def _players_by_role(self, role: Role) -> List[Player]:
        return [p for p in self.players.values() if p.alive and p.role == role]

    def _log(self, line: str) -> None:
        ts = time.strftime("%H:%M:%S")
        self.state.narrator.append(f"[{ts}] {line}")
        self.state.narrator = self.state.narrator[-200:]

    def _public_snapshot(self) -> Dict[str, Any]:
        alive = []
        dead = []
        for p in self.players.values():
            entry = {"id": p.id, "name": p.name, "alive": p.alive}
            if p.alive:
                alive.append(entry)
            else:
                entry["role"] = p.role.value if p.role else None
                entry["role_fr"] = ROLE_FR.get(p.role) if p.role else None
                dead.append(entry)

        return {
            "phase": self.state.phase,
            "night_count": self.state.night_count,
            "day_count": self.state.day_count,
            "started": self.state.started,
            "winner": self.state.winner,
            "alive": alive,
            "dead": dead,
            "timers": {
                "phase_ends_at": self.state.timers.phase_ends_at,
                "seconds_left": self.state.timers.seconds_left,
            },
        }

    def _private_snapshot(self, player_id: str) -> Dict[str, Any]:
        p = self.players.get(player_id)
        if not p:
            return {}
        base = self._public_snapshot()
        base["me"] = {
            "id": p.id,
            "name": p.name,
            "alive": p.alive,
            "role": p.role.value if p.role else None,
            "role_fr": ROLE_FR.get(p.role) if p.role else None,
            "lover_id": p.lover_id,
            "witch_heal_used": p.witch_heal_used,
            "witch_poison_used": p.witch_poison_used,
        }
        
        if self.state.phase == Phase.NIGHT and self.state.pending.step and time.time() <= self.state.pending.deadline:
            step = self.state.pending.step
            is_actor = ((step == "WOLVES" and p.role == Role.WEREWOLF)
                        or (step == "SEER" and p.role == Role.SEER)
                        or (step == "WITCH" and p.role == Role.WITCH)
                        or (step == "CUPID" and p.role == Role.CUPID))
            if is_actor and p.alive:
                base["pending_step"] = step
                base["pending_deadline"] = self.state.pending.deadline
            else:
                base["pending_step"] = None
                base["pending_deadline"] = None
        else:
            base["pending_step"] = None
            base["pending_deadline"] = None

        if p.role == Role.WEREWOLF:
            wolves_team = self._players_by_role(Role.WEREWOLF)
            base["wolves_team"] = [{"id": w.id, "name": w.name} for w in wolves_team]
            if self.state.pending.step == "WOLVES" and time.time() <= self.state.pending.deadline:
                votes: Dict[str, Optional[str]] = {}
                for w in wolves_team:
                    data = self.state.pending.received.get(w.id)
                    target = data.get("target") if isinstance(data, dict) else None
                    if target in self.players and self.players[target].alive and self.players[target].role != Role.WEREWOLF:
                        votes[w.id] = target
                    else:
                        votes[w.id] = None
                base["wolves_votes"] = votes

        if p.role == Role.WITCH and self.state.phase == Phase.NIGHT and self.state.wolves_victim:
            victim = self.state.wolves_victim
            base["witch_ctx"] = {
                "victim_id": victim,
                "victim_name": self.players[victim].name if victim in self.players else None,
            }

        if p.lover_id and p.lover_id in self.players:
            base["lover_name"] = self.players[p.lover_id].name
        return base

    async def _send(self, ws: WebSocket, msg: Dict[str, Any]) -> None:
        await ws.send_text(json.dumps(msg, ensure_ascii=False))

    async def _broadcast_public(self, msg: Dict[str, Any]) -> None:
        dead_clients = []
        for c in list(self._clients):
            try:
                await self._send(c.websocket, msg)
            except Exception:
                dead_clients.append(c)
        for c in dead_clients:
            self._clients.discard(c)

    async def _send_private(self, player_id: str, msg: Dict[str, Any]) -> None:
        dead_clients = []
        for c in list(self._clients):
            if c.client_type == WSClientType.PLAYER and c.player_id == player_id:
                try:
                    await self._send(c.websocket, msg)
                except Exception:
                    dead_clients.append(c)
        for c in dead_clients:
            self._clients.discard(c)

    async def _sync_all(self) -> None:
        await self._broadcast_public({"type": "PUBLIC_STATE", "data": self._public_snapshot()})
        for c in list(self._clients):
            if c.client_type == WSClientType.PLAYER and c.player_id:
                await self._send_private(c.player_id, {"type": "PRIVATE_STATE", "data": self._private_snapshot(c.player_id)})

    async def _narrate(self, line: str) -> None:
        self._log(line)
        await self._broadcast_public({"type": "NARRATOR_LINE", "line": self.state.narrator[-1]})

    async def join(self, name: str) -> str:
        async with self._lock:
            pid = uuid.uuid4().hex[:8]
            self.players[pid] = Player(id=pid, name=(name.strip()[:24] or f"Player-{pid}"))
        await self._narrate(f"{name} a rejoint le village.")
        await self._sync_all()
        return pid

    async def reset(self) -> None:
        async with self._lock:
            self.state = GameState()
            self.players = {}
            self._runner_task = None
        await self._broadcast_public({"type": "RESET"})

    async def configure(self, cfg: Dict[str, Any]) -> None:
        async with self._lock:
            if self.state.started:
                return
            if "nightAction" in cfg:
                self.T_NIGHT_STEP = max(10, min(120, int(cfg["nightAction"])))
            if "dayDiscuss" in cfg:
                self.T_DISCUSS = max(10, min(300, int(cfg["dayDiscuss"])))
            if "voteTime" in cfg:
                self.T_VOTE = max(10, min(120, int(cfg["voteTime"])))
            if "resultTime" in cfg:
                self.T_RESULT = max(3, min(30, int(cfg["resultTime"])))
            if "roles" in cfg:
                roles_cfg = cfg["roles"]
                self.use_seer = bool(roles_cfg.get("seer", True))
                self.use_witch = bool(roles_cfg.get("witch", True))
                self.use_cupid = bool(roles_cfg.get("cupid", True))
                self.use_hunter = bool(roles_cfg.get("hunter", False))

    async def start(self) -> None:
        async with self._lock:
            if self.state.started:
                return
            if len(self.players) < 5:
                raise ValueError("Il faut au moins 5 joueurs.")
            self.state.started = True
            self.state.phase = Phase.NIGHT
            self._assign_roles()

        await self._narrate("La partie commence. Les rôles ont été distribués.")
        await self._sync_all()

        if not self._runner_task or self._runner_task.done():
            self._runner_task = asyncio.create_task(self._run())

    def _assign_roles(self) -> None:
        ids = list(self.players.keys())
        random.shuffle(ids)
        
        player_count = len(ids)
        wolf_count = get_werewolf_count(player_count)
        
        roles: List[Role] = []
        for _ in range(wolf_count):
            roles.append(Role.WEREWOLF)
        
        # Add special roles based on config
        if self.use_seer:
            roles.append(Role.SEER)
        if self.use_witch:
            roles.append(Role.WITCH)
        if self.use_cupid:
            roles.append(Role.CUPID)
        
        villager_count = player_count - len(roles)
        roles += [Role.VILLAGER] * villager_count
        
        random.shuffle(roles)

        for pid, r in zip(ids, roles):
            self.players[pid].role = r

        for p in self.players.values():
            p.witch_heal_used = False
            p.witch_poison_used = False
            p.lover_id = None
            p.alive = True

    async def _run(self) -> None:
        while True:
            winner = self._check_winner()
            if winner:
                await self._end_game(winner)
                return

            await self._night()
            winner = self._check_winner()
            if winner:
                await self._end_game(winner)
                return

            await self._day_and_vote()
            winner = self._check_winner()
            if winner:
                await self._end_game(winner)
                return

    async def _night(self) -> None:
        async with self._lock:
            self.state.phase = Phase.NIGHT
            self.state.night_count += 1
            self.state.wolves_victim = None
            self.state.witch_heal = False
            self.state.witch_poison_target = None
        await self._narrate(f"Nuit {self.state.night_count}. Le village s'endort.")
        await self._sync_all()

        if self.state.night_count == 1:
            await self._step_cupid()

        await self._step_wolves()
        await self._step_seer()
        await self._step_witch()
        await self._resolve_night()

    async def _day_and_vote(self) -> None:
        async with self._lock:
            self.state.phase = Phase.DAY
            self.state.day_count += 1
        await self._narrate(f"Jour {self.state.day_count}. Discutez.")
        await self._countdown(self.T_DISCUSS, phase=Phase.DAY, label="Discussion")
        await self._vote_phase()

    async def _vote_phase(self) -> None:
        async with self._lock:
            self.state.phase = Phase.VOTE
            self.state.vote_box = VoteBox()
            self.state.vote_box.deadline = time.time() + self.T_VOTE

        await self._narrate(f"Le vote commence ({self.T_VOTE}s).")
        await self._broadcast_public({"type": "VOTE_STARTED", "seconds": self.T_VOTE})
        await self._sync_all()

        while True:
            async with self._lock:
                alive = self._alive_ids()
                votes = dict(self.state.vote_box.votes)
                remaining = int(max(0, self.state.vote_box.deadline - time.time()))
                all_voted = len(votes) >= len(alive) and len(alive) > 0
                self.state.timers.phase_ends_at = self.state.vote_box.deadline
                self.state.timers.seconds_left = remaining

            await self._broadcast_public({"type": "VOTE_STATUS", "received": len(votes), "total": len(alive), "seconds_left": remaining})
            await self._sync_all()

            if all_voted or remaining <= 0:
                break
            await asyncio.sleep(1)

        await self._narrate("Vote terminé. Décompte...")
        await self._resolve_vote()

    async def _step_cupid(self) -> None:
        cupids = self._players_by_role(Role.CUPID)
        if not cupids:
            return
        cupid = cupids[0]
        await self._narrate("Cupidon, désigne deux amoureux.")
        await self._request_action(
            step="CUPID",
            actor_ids=[cupid.id],
            payload={"action": "cupid_pick_two"},
            timeout=self.T_NIGHT_STEP,
        )

        async with self._lock:
            data = self.state.pending.received.get(cupid.id) or {}
            if not isinstance(data, dict):
                data = {}
            lovers = data.get("targets") or []
            lovers = [x for x in lovers if x in self.players and self.players[x].alive]
            lovers = list(dict.fromkeys(lovers))
            if len(lovers) == 2:
                a, b = lovers
                self.players[a].lover_id = b
                self.players[b].lover_id = a
                asyncio.create_task(self._send_private(a, {"type": "LOVER_ASSIGNED", "lover_id": b, "lover_name": self.players[b].name}))
                asyncio.create_task(self._send_private(b, {"type": "LOVER_ASSIGNED", "lover_id": a, "lover_name": self.players[a].name}))

        await self._narrate("Cupidon ferme les yeux.")
        await self._sync_all()

    async def _step_wolves(self) -> None:
        wolves = self._players_by_role(Role.WEREWOLF)
        if not wolves:
            return
        await self._narrate("Les Loups-Garous, choisissez une victime.")

        actor_ids = [w.id for w in wolves if w.alive]
        if not actor_ids:
            return

        await self._request_wolves_vote(actor_ids=actor_ids, timeout=self.T_NIGHT_STEP)

        async with self._lock:
            alive_wolves = [wid for wid in actor_ids if wid in self.players and self.players[wid].alive]
            
            # Collect valid votes
            votes = []
            for wid in alive_wolves:
                data = self.state.pending.received.get(wid)
                t = data.get("target") if isinstance(data, dict) else None
                if t in self.players and self.players[t].alive and self.players[t].role != Role.WEREWOLF:
                    votes.append(t)

            victim = None
            if votes:
                # Majority vote (or random among tied leaders)
                tally = {}
                for t in votes:
                    tally[t] = tally.get(t, 0) + 1
                maxv = max(tally.values())
                leaders = [t for t, c in tally.items() if c == maxv]
                victim = random.choice(leaders)
            else:
                # NO VOTES: Pick random victim (wolves MUST kill)
                non_wolves = [p for p in self.players.values() if p.alive and p.role != Role.WEREWOLF]
                if non_wolves:
                    victim = random.choice(non_wolves).id
                    await self._narrate("Les loups n'ont pas choisi... la faim décide pour eux!")

            self.state.wolves_victim = victim

        await self._narrate("Les Loups-Garous ferment les yeux.")
        await self._sync_all()

    async def _step_seer(self) -> None:
        seers = self._players_by_role(Role.SEER)
        if not seers:
            return
        seer = seers[0]
        await self._narrate("La Voyante, choisis quelqu'un à révéler.")
        await self._request_action(
            step="SEER",
            actor_ids=[seer.id],
            payload={"action": "seer_pick_one"},
            timeout=self.T_NIGHT_STEP,
        )
        async with self._lock:
            data = self.state.pending.received.get(seer.id) or {}
            target = data.get("target") if isinstance(data, dict) else None
            if target in self.players and self.players[target].alive:
                role_obj = self.players[target].role
                role_key = role_obj.value if role_obj else None
                role_fr = ROLE_FR.get(role_obj) if role_obj else None
                await self._send_private(seer.id, {"type": "SEER_RESULT", "target_id": target, "target_name": self.players[target].name, "role": role_key, "role_fr": role_fr})
        await self._narrate("La Voyante ferme les yeux.")
        await self._sync_all()

    async def _step_witch(self) -> None:
        witches = self._players_by_role(Role.WITCH)
        if not witches:
            return
        witch = witches[0]
        async with self._lock:
            victim = self.state.wolves_victim

        # Send witch context BEFORE requesting action
        if victim and victim in self.players:
            await self._send_private(witch.id, {
                "type": "WITCH_CONTEXT",
                "wolves_victim_id": victim,
                "wolves_victim_name": self.players[victim].name,
                "heal_used": witch.witch_heal_used,
                "poison_used": witch.witch_poison_used,
            })

        await self._narrate("La Sorcière, utilise tes potions si tu le souhaites.")
        await self._request_action(
            step="WITCH",
            actor_ids=[witch.id],
            payload={"action": "witch_decide"},
            timeout=self.T_NIGHT_STEP,
        )
        async with self._lock:
            data = self.state.pending.received.get(witch.id) or {}
            if not isinstance(data, dict):
                data = {}
            heal = bool(data.get("heal"))
            poison_target = data.get("poison_target")
            if heal and not witch.witch_heal_used:
                witch.witch_heal_used = True
                self.state.witch_heal = True
            if poison_target in self.players and self.players[poison_target].alive and not witch.witch_poison_used:
                witch.witch_poison_used = True
                self.state.witch_poison_target = poison_target

        await self._narrate("La Sorcière ferme les yeux.")
        await self._sync_all()

    async def _resolve_night(self) -> None:
        async with self._lock:
            victim = self.state.wolves_victim
            deaths = set()

            if victim and not self.state.witch_heal:
                deaths.add(victim)

            if self.state.witch_poison_target:
                deaths.add(self.state.witch_poison_target)

            deaths_final = set()
            for d in deaths:
                if d in self.players and self.players[d].alive:
                    deaths_final.add(d)

            lover_deaths: Dict[str, str] = {}
            
            changed = True
            while changed:
                changed = False
                for d in list(deaths_final):
                    lover = self.players[d].lover_id if d in self.players else None
                    if lover and lover in self.players and self.players[lover].alive and lover not in deaths_final:
                        deaths_final.add(lover)
                        lover_deaths[lover] = d
                        changed = True

            for pid in deaths_final:
                self.players[pid].alive = False

        if not deaths_final:
            await self._narrate("L'aube se lève... personne n'est mort cette nuit!")
        else:
            primary_deaths = [pid for pid in deaths_final if pid not in lover_deaths]
            for pid in primary_deaths:
                p = self.players[pid]
                role_fr = ROLE_FR.get(p.role) if p.role else "-"
                await self._narrate(f"L'aube se lève... {p.name} est mort. ({role_fr})")
            
            for lover_pid, original_pid in lover_deaths.items():
                p = self.players[lover_pid]
                original_p = self.players[original_pid]
                role_fr = ROLE_FR.get(p.role) if p.role else "-"
                await self._narrate(f"{p.name} meurt de chagrin, amoureux de {original_p.name}. ({role_fr})")

        await self._sync_all()
        await asyncio.sleep(0.8)

    async def _resolve_vote(self) -> None:
        async with self._lock:
            alive = self._alive_ids()
            votes = dict(self.state.vote_box.votes)
            tally = {}
            for voter, target in votes.items():
                if voter in alive and target in alive:
                    tally[target] = tally.get(target, 0) + 1

            eliminated = None
            if tally:
                max_votes = max(tally.values())
                top = [pid for pid, c in tally.items() if c == max_votes]
                eliminated = random.choice(top)
            else:
                # No votes at all - random elimination
                if alive:
                    eliminated = random.choice(alive)

            if eliminated and eliminated in self.players:
                self.players[eliminated].alive = False

        safe_tally = [{"id": pid, "name": self.players[pid].name, "votes": cnt} for pid, cnt in sorted(tally.items(), key=lambda x: -x[1])]
        if eliminated:
            p = self.players[eliminated]
            await self._broadcast_public({
                "type": "VOTE_RESULT",
                "tally": safe_tally,
                "eliminated": {"id": eliminated, "name": p.name, "role": p.role.value if p.role else None, "role_fr": ROLE_FR.get(p.role) if p.role else None},
            })
            role_fr = ROLE_FR.get(p.role) if p.role else "-"
            await self._narrate(f"Le village a décidé: {p.name} est éliminé. ({role_fr})")
        else:
            await self._broadcast_public({"type": "VOTE_RESULT", "tally": safe_tally, "eliminated": None})
            await self._narrate("Personne n'a été éliminé.")

        await self._sync_all()
        await asyncio.sleep(self.T_RESULT)

    def _check_winner(self) -> Optional[str]:
        if not self.state.started:
            return None
        wolves = [p for p in self.players.values() if p.alive and p.role == Role.WEREWOLF]
        non_wolves = [p for p in self.players.values() if p.alive and p.role != Role.WEREWOLF]
        if len(self._alive_players()) == 0:
            return "nobody"
        if len(wolves) == 0:
            return "villagers"
        if len(wolves) >= len(non_wolves):
            return "werewolves"
        return None

    async def _end_game(self, winner: str) -> None:
        async with self._lock:
            self.state.phase = Phase.GAME_OVER
            self.state.winner = winner
        await self._narrate(f"Fin de partie! Victoire: {WINNER_FR.get(winner, winner)}.")
        await self._broadcast_public({"type": "GAME_OVER", "winner": winner, "winner_fr": WINNER_FR.get(winner, winner)})
        await self._sync_all()

    async def _request_action(self, step: str, actor_ids: List[str], payload: Dict[str, Any], timeout: int) -> None:
        async with self._lock:
            self.state.pending = ActionInbox(step=step, deadline=time.time() + timeout)
            self.state.pending.event.clear()

        for aid in actor_ids:
            if aid in self.players and self.players[aid].alive:
                await self._send_private(aid, {"type": "ACTION_REQUEST", "step": step, "deadline": self.state.pending.deadline, "payload": payload})

        while True:
            async with self._lock:
                received = dict(self.state.pending.received)
                remaining = int(max(0, self.state.pending.deadline - time.time()))
                alive_actors = [aid for aid in actor_ids if aid in self.players and self.players[aid].alive]
                done = all(aid in received for aid in alive_actors) or remaining <= 0
                self.state.timers.phase_ends_at = self.state.pending.deadline
                self.state.timers.seconds_left = remaining

            await self._sync_all()
            if done:
                break
            await asyncio.sleep(1)

    async def _request_wolves_vote(self, actor_ids: List[str], timeout: int) -> None:
        async with self._lock:
            self.state.pending = ActionInbox(step="WOLVES", deadline=time.time() + timeout)
            self.state.pending.event.clear()

        for aid in actor_ids:
            if aid in self.players and self.players[aid].alive:
                await self._send_private(aid, {
                    "type": "ACTION_REQUEST",
                    "step": "WOLVES",
                    "deadline": self.state.pending.deadline,
                    "payload": {"action": "wolf_vote_victim"},
                })

        announced_unanimity = False
        while True:
            async with self._lock:
                remaining = int(max(0, self.state.pending.deadline - time.time()))
                alive_actors = [aid for aid in actor_ids if aid in self.players and self.players[aid].alive]
                targets = []
                for wid in alive_actors:
                    data = self.state.pending.received.get(wid)
                    t = data.get("target") if isinstance(data, dict) else None
                    if t in self.players and self.players[t].alive and self.players[t].role != Role.WEREWOLF:
                        targets.append(t)

                unanimous = (len(alive_actors) > 0 and len(targets) == len(alive_actors) and len(set(targets)) == 1)
                self.state.timers.phase_ends_at = self.state.pending.deadline
                self.state.timers.seconds_left = remaining

            await self._sync_all()

            if unanimous and not announced_unanimity:
                announced_unanimity = True
                await self._narrate("Unanimité des loups atteinte.")

            if remaining <= 0 or unanimous:
                break
            await asyncio.sleep(1)

    async def submit_action(self, player_id: str, step: str, data: Dict[str, Any]) -> None:
        async with self._lock:
            if self.state.pending.step != step:
                return
            if time.time() > self.state.pending.deadline:
                return
            if player_id not in self.players or not self.players[player_id].alive:
                return
            self.state.pending.received[player_id] = data
            self.state.pending.event.set()

    async def cast_vote(self, voter_id: str, target_id: str) -> None:
        async with self._lock:
            if self.state.phase != Phase.VOTE:
                return
            if time.time() > self.state.vote_box.deadline:
                return
            if voter_id not in self.players or not self.players[voter_id].alive:
                return
            if target_id not in self.players or not self.players[target_id].alive:
                return
            self.state.vote_box.votes[voter_id] = target_id
            self.state.vote_box.event.set()

    async def _countdown(self, seconds: int, phase: Phase, label: str) -> None:
        end = time.time() + seconds
        while True:
            remaining = int(max(0, end - time.time()))
            async with self._lock:
                if self.state.phase != phase:
                    return
                self.state.timers.phase_ends_at = end
                self.state.timers.seconds_left = remaining
            await self._broadcast_public({"type": "COUNTDOWN", "label": label, "seconds_left": remaining})
            await self._sync_all()
            if remaining <= 0:
                break
            await asyncio.sleep(1)


app = FastAPI(title="Loup-Garou MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"
if WEB_DIR.exists():
    app.mount("/tv", StaticFiles(directory=str(WEB_DIR / "tv"), html=True), name="tv")
    app.mount("/player", StaticFiles(directory=str(WEB_DIR / "player"), html=True), name="player")
    app.mount("/static", StaticFiles(directory=str(WEB_DIR / "static")), name="static")

GAME = Game()


@app.get("/")
async def root():
    return {"ok": True, "hint": "Open /tv/ for TV, /player/ for players."}


@app.get("/api/health")
async def health():
    return {"ok": True, "phase": GAME.state.phase}


@app.post("/api/join")
async def api_join(payload: Dict[str, Any]):
    name = (payload.get("name") or "").strip() or "Player"
    pid = await GAME.join(name)
    return {"ok": True, "player_id": pid}


@app.post("/api/start")
async def api_start():
    try:
        await GAME.start()
        return {"ok": True}
    except ValueError as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/reset")
async def api_reset():
    await GAME.reset()
    return {"ok": True}


@app.post("/api/config")
async def api_config(payload: Dict[str, Any]):
    await GAME.configure(payload)
    return {"ok": True}


@app.post("/api/action")
async def api_action(payload: Dict[str, Any]):
    player_id = payload.get("player_id")
    step = payload.get("step")
    data = payload.get("data") or {}
    if not isinstance(data, dict):
        data = {}
    if not player_id or not step:
        return {"ok": False, "error": "Missing player_id or step"}
    await GAME.submit_action(player_id, step, data)
    return {"ok": True}


@app.post("/api/vote")
async def api_vote(payload: Dict[str, Any]):
    voter_id = payload.get("voter_id")
    target_id = payload.get("target_id")
    if not voter_id or not target_id:
        return {"ok": False, "error": "Missing voter_id or target_id"}
    await GAME.cast_vote(voter_id, target_id)
    return {"ok": True}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    qp = dict(ws.query_params)
    client = qp.get("client", "tv")
    player_id = qp.get("player_id")

    if client not in ("tv", "player"):
        await ws.close()
        return

    ctype = WSClientType.TV if client == "tv" else WSClientType.PLAYER
    client_obj = WSClient(websocket=ws, client_type=ctype, player_id=player_id if ctype == WSClientType.PLAYER else None)
    GAME._clients.add(client_obj)

    await GAME._send(ws, {"type": "HELLO", "client": client, "player_id": player_id})
    await GAME._send(ws, {"type": "PUBLIC_STATE", "data": GAME._public_snapshot()})
    if ctype == WSClientType.PLAYER and player_id:
        await GAME._send(ws, {"type": "PRIVATE_STATE", "data": GAME._private_snapshot(player_id)})

    try:
        while True:
            msg = await ws.receive_text()
            try:
                data = json.loads(msg)
            except Exception:
                data = {"type": "PING"}
            if data.get("type") == "PING":
                await GAME._send(ws, {"type": "PONG"})
    except Exception:
        GAME._clients.discard(client_obj)
        try:
            await ws.close()
        except Exception:
            pass