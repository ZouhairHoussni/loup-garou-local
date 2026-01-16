"""Shared fixtures and utilities for Loup-Garou tests."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest
from httpx import AsyncClient, ASGITransport

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import Game, Role, Phase, Player, app, GAME


@pytest.fixture
def game() -> Game:
    """Fresh Game instance for each test."""
    return Game()


@pytest.fixture
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


async def add_players(game: Game, count: int, names: List[str] | None = None) -> List[str]:
    """Add players to a game and return their IDs."""
    if names is None:
        names = [f"Player{i+1}" for i in range(count)]
    
    player_ids = []
    for name in names[:count]:
        pid = await game.join(name)
        player_ids.append(pid)
    return player_ids


def count_roles(game: Game) -> Dict[Role, int]:
    """Count the number of each role assigned in the game."""
    counts: Dict[Role, int] = {}
    for player in game.players.values():
        if player.role:
            counts[player.role] = counts.get(player.role, 0) + 1
    return counts


def get_players_by_role(game: Game, role: Role) -> List[Player]:
    """Get all players with a specific role."""
    return [p for p in game.players.values() if p.role == role]


def get_alive_players(game: Game) -> List[Player]:
    """Get all alive players."""
    return [p for p in game.players.values() if p.alive]


def kill_player(game: Game, player_id: str) -> None:
    """Kill a player directly (for testing win conditions)."""
    if player_id in game.players:
        game.players[player_id].alive = False


def set_player_role(game: Game, player_id: str, role: Role) -> None:
    """Set a player's role directly (for testing specific scenarios)."""
    if player_id in game.players:
        game.players[player_id].role = role


@pytest.fixture
async def client():
    """Async HTTP client for API testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
async def reset_global_game():
    """Reset the global GAME instance before each test."""
    await GAME.reset()
    yield
    await GAME.reset()
