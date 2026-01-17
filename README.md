# Loup-Garou MVP (Local) — Smooth Pack

This pack runs **everything from one FastAPI server**:
- **TV/Narrator** UI: `/tv/`
- **Player** UI: `/player/`
- Shared assets: `/static/` (CSS + `cards/`)

No more separate `python -m http.server` processes.

## 1) Install

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

## 2) Run backend

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

## 3) Open the UIs

- TV screen: `http://127.0.0.1:8000/tv/`
- Player: `http://127.0.0.1:8000/player/?name=Alice&autojoin=1`

Bots:
- Add `&bot=1` to auto-play as a bot.

## 4) Spawn multiple players (Windows)

From PowerShell in the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\spawn_players.ps1 -Count 6 -Bot
```

By default it opens: `http://127.0.0.1:8000/player/`

## 5) Cards

Place your real card images in:

```
web/static/cards/
```

This pack ships with **placeholder PNG cards**:
- verso.png
- villageois.png
- loup-garou.png
- voyante.png
- sorciere.png
- cupidon.png

If your filenames differ, edit the `CARD_FILES` mapping in `web/static/shared.js`.

## Troubleshooting quick checks

- If TV shows no players: make sure you opened **/tv/** (not an old port 3000/3001 static server).
- If you see WS disconnected (red dot): backend not running or port mismatch.
- If you changed the backend port, add `?backendPort=XXXX` to the URL (TV and players).
# 🎭 Audio Files - Loup-Garou TV Narrator

Place your audio files (.mp3 or .ogg) in this folder.

## 📁 Folder Structure

```
audio/
├── names/              # Player names pronounced
│   ├── alice.mp3
│   ├── bob.mp3
│   └── ... (add as needed)
├── roles/              # Role names pronounced
│   ├── villageois.mp3
│   ├── loup_garou.mp3
│   ├── voyante.mp3
│   ├── sorciere.mp3
│   ├── cupidon.mp3
│   ├── chasseur.mp3
│   └── amoureux.mp3
└── (narrator files in root)
```

---

## 🎤 NARRATOR AUDIO FILES

### 📥 LOBBY - Player Joins
| Filename | French Text | Context |
|----------|-------------|---------|
| `lobby_new_traveler.mp3` | "Un nouveau voyageur..." | When player joins (part 1) |
| `lobby_joined_village.mp3` | "...a rejoint le village." | When player joins (part 2) |

### 🎬 GAME START
| Filename | French Text | Context |
|----------|-------------|---------|
| `start_listen.mp3` | "Écoutez... la partie commence." | Game begins |
| `start_roles_sealed.mp3` | "Les rôles ont été scellés par le destin." | After roles assigned |

### 🌙 NIGHT FALLS
| Filename | French Text | Context |
|----------|-------------|---------|
| `night_lanterns.mp3` | "Que les lanternes s'éteignent..." | Night begins (part 1) |
| `night_village_sleeps.mp3` | "Le village s'endort sous le voile de la lune." | Night begins (part 2) |

### 💘 CUPID PHASE
| Filename | French Text | Context |
|----------|-------------|---------|
| `cupid_wake.mp3` | "Cupidon..." | Cupid wakes |
| `cupid_choose.mp3` | "De tes flèches, désigne deux âmes à lier." | Cupid instruction |
| `cupid_close.mp3` | "Cupidon referme les yeux..." | Cupid done (part 1) |
| `cupid_spell_cast.mp3` | "Le sort est jeté." | Cupid done (part 2) |

### 🐺 WEREWOLVES PHASE
| Filename | French Text | Context |
|----------|-------------|---------|
| `wolves_wake.mp3` | "Les Loups-Garous..." | Wolves wake |
| `wolves_choose.mp3` | "Dans l'ombre, choisissez une victime." | Wolves instruction |
| `wolves_unanimous.mp3` | "Je sens vos crocs s'accorder... Unanimité." | Wolves agreed |
| `wolves_no_choice.mp3` | "Vous n'avez rien scellé..." | Wolves didn't agree (part 1) |
| `wolves_hunger_decides.mp3` | "Alors la faim décide... cruelle et aveugle." | Random victim chosen (part 2) |
| `wolves_close_1.mp3` | "Loups-Garous..." | Wolves done (part 1) |
| `wolves_close_2.mp3` | "Retournez aux ténèbres." | Wolves done (part 2) |
| `wolves_close_3.mp3` | "Fermez les yeux." | Wolves done (part 3) |

### 🔮 SEER PHASE
| Filename | French Text | Context |
|----------|-------------|---------|
| `seer_wake.mp3` | "Voyante..." | Seer wakes |
| `seer_pierce.mp3` | "Perce le voile." | Seer instruction (part 1) |
| `seer_choose.mp3` | "Choisis une âme à révéler." | Seer instruction (part 2) |
| `seer_close.mp3` | "La Voyante ferme les yeux..." | Seer done (part 1) |
| `seer_secret.mp3` | "Et le secret retourne au silence." | Seer done (part 2) |

### 🧪 WITCH PHASE
| Filename | French Text | Context |
|----------|-------------|---------|
| `witch_wake.mp3` | "Sorcière..." | Witch wakes |
| `witch_potions.mp3` | "Tes fioles frémissent." | Witch instruction (part 1) |
| `witch_save.mp3` | "Veux-tu sauver..." | Witch option save |
| `witch_kill.mp3` | "...ou condamner ?" | Witch option kill |
| `witch_close.mp3` | "La Sorcière ferme les yeux..." | Witch done (part 1) |
| `witch_magic_sleeps.mp3` | "Que la magie s'endorme." | Witch done (part 2) |

### ☀️ DAWN - No Deaths
| Filename | French Text | Context |
|----------|-------------|---------|
| `dawn_rises.mp3` | "L'aube se lève..." | Dawn begins |
| `dawn_no_death_1.mp3` | "Et, contre toute attente..." | No death (part 1) |
| `dawn_no_death_2.mp3` | "Personne n'est mort cette nuit." | No death (part 2) |

### ☀️ DAWN - Death Announcement
| Filename | French Text | Context |
|----------|-------------|---------|
| `dawn_rises.mp3` | "L'aube se lève..." | Dawn begins (same as above) |
| `dawn_voice_missing.mp3` | "Une voix manque à l'appel..." | Someone died |
| `dawn_died_tonight.mp3` | "...est mort cette nuit." | After name (part 1) |
| `dawn_role_was.mp3` | "Son rôle était..." | Before role reveal |

### 💔 LOVER DEATH (Heartbreak)
| Filename | French Text | Context |
|----------|-------------|---------|
| `lover_grief.mp3` | "Le chagrin emporte..." | Lover dies (part 1) |
| `lover_in_love_with.mp3` | "...amoureux de..." | Lover connection |
| `lover_dies_grief.mp3` | "Il meurt de chagrin." | Lover death conclusion |

### 🗣️ DAY DISCUSSION
| Filename | French Text | Context |
|----------|-------------|---------|
| `day_new.mp3` | "Jour nouveau..." | Day begins |
| `day_speak.mp3` | "Parlez." | Discussion starts (part 1) |
| `day_accuse.mp3` | "Accusez... défendez..." | Discussion (part 2) |
| `day_choose_wisely.mp3` | "Mais choisissez avec sagesse." | Discussion (part 3) |

### 🗳️ VOTE PHASE
| Filename | French Text | Context |
|----------|-------------|---------|
| `vote_begins.mp3` | "Le vote commence..." | Vote starts |
| `vote_time_limited.mp3` | "Le temps est compté." | Vote timer |
| `vote_closed.mp3` | "Le vote est clos..." | Voting ended |
| `vote_counting.mp3` | "Je compte les voix..." | Counting |
| `vote_one_by_one.mp3` | "...une à une." | Counting (part 2) |

### ⚔️ EXECUTION
| Filename | French Text | Context |
|----------|-------------|---------|
| `exec_decided.mp3` | "Le village a tranché..." | Execution intro |
| `exec_eliminated.mp3` | "...est éliminé." | After name |
| `exec_role_was.mp3` | "Et son rôle était..." | Before role |

### ⚖️ NO EXECUTION (Tie)
| Filename | French Text | Context |
|----------|-------------|---------|
| `exec_none_today.mp3` | "Aujourd'hui..." | No execution (part 1) |
| `exec_nobody.mp3` | "Personne n'a été éliminé." | No execution (part 2) |
| `exec_doubt.mp3` | "Le doute règne encore." | No execution (part 3) |

### 🌑 NIGHT RETURNS
| Filename | French Text | Context |
|----------|-------------|---------|
| `night_returns.mp3` | "La nuit retombe..." | Night comes again |
| `night_hearts_silent.mp3` | "Que les cœurs se taisent..." | Night mood (part 1) |
| `night_fear_walks.mp3` | "...et que la peur marche sur la pointe des pieds." | Night mood (part 2) |

### 🏆 GAME OVER - Village Wins
| Filename | French Text | Context |
|----------|-------------|---------|
| `end_game.mp3` | "Fin de partie..." | Game ends |
| `end_day_triumphs.mp3` | "Le jour triomphe." | Village wins (part 1) |
| `end_village_wins.mp3` | "Victoire des Villageois." | Village wins (part 2) |

### 🐺 GAME OVER - Wolves Win
| Filename | French Text | Context |
|----------|-------------|---------|
| `end_game.mp3` | "Fin de partie..." | Game ends (same) |
| `end_night_devours.mp3` | "La nuit dévore le village." | Wolves win (part 1) |
| `end_wolves_win.mp3` | "Victoire des Loups-Garous." | Wolves win (part 2) |

### 💕 GAME OVER - Lovers Win
| Filename | French Text | Context |
|----------|-------------|---------|
| `end_game.mp3` | "Fin de partie..." | Game ends (same) |
| `end_hearts_won.mp3` | "Deux cœurs ont vaincu la peur." | Lovers win (part 1) |
| `end_lovers_win.mp3` | "Victoire des Amoureux." | Lovers win (part 2) |

---

## 📁 PLAYER NAMES FOLDER (`names/`)

Add MP3 files for each player name you expect:
```
names/
├── alice.mp3
├── axel.mp3
├── bob.mp3
├── camille.mp3
├── david.mp3
├── emma.mp3
├── lucas.mp3
├── marie.mp3
├── nicolas.mp3
├── sophie.mp3
└── ... (add more as needed)
```

**Naming convention:** lowercase, no accents, no spaces
- "Jean-Pierre" → `jean_pierre.mp3`
- "Élodie" → `elodie.mp3`
- "Marie" → `marie.mp3`

---

## 📁 ROLE NAMES FOLDER (`roles/`)

```
roles/
├── villageois.mp3      # "Villageois"
├── loup_garou.mp3      # "Loup-Garou"
├── voyante.mp3         # "Voyante"
├── sorciere.mp3        # "Sorcière"
├── cupidon.mp3         # "Cupidon"
├── chasseur.mp3        # "Chasseur"
└── amoureux.mp3        # "Amoureux" (for lover deaths)
```

---

## 🎙️ Recording Tips

1. **Voice style:** Deep, mysterious, dramatic narrator
2. **Pace:** Slow, with pauses for effect
3. **Format:** MP3, 128-192 kbps
4. **Duration:** Match the drama - pauses matter!
5. **Silence:** Add ~0.2s silence at start/end of each file

## 🤖 AI Voice Generation

You can use AI TTS services:
- **ElevenLabs** - High quality, multilingual
- **Azure TTS** - Microsoft's neural voices
- **Google Cloud TTS** - Good French voices
- **Coqui TTS** - Open source option

Recommended voice settings for French narrator:
- Male voice, deep tone
- Slow speed (0.8-0.9x)
- High stability, low creativity