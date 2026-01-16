"""Tests for win conditions in Loup-Garou."""
from __future__ import annotations

import pytest
from server import Game, Role, Phase
from conftest import add_players, set_player_role, kill_player, get_players_by_role


class TestVillagersWin:
    """Test villagers win condition."""

    @pytest.mark.asyncio
    async def test_villagers_win_when_all_werewolves_dead(self):
        """Villagers should win when all werewolves are eliminated."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        # Kill all werewolves
        wolves = get_players_by_role(game, Role.WEREWOLF)
        for wolf in wolves:
            kill_player(game, wolf.id)
        
        winner = game._check_winner()
        assert winner == "villagers"

    @pytest.mark.asyncio
    async def test_villagers_win_with_multiple_alive(self):
        """Villagers win should work even with multiple villagers alive."""
        game = Game()
        player_ids = await add_players(game, 8)
        await game.start()
        
        # Kill all werewolves
        wolves = get_players_by_role(game, Role.WEREWOLF)
        for wolf in wolves:
            kill_player(game, wolf.id)
        
        winner = game._check_winner()
        assert winner == "villagers"


class TestWerewolvesWin:
    """Test werewolves win condition."""

    @pytest.mark.asyncio
    async def test_werewolves_win_when_equal_to_nonwolves(self):
        """Werewolves should win when wolves >= non-wolves."""
        game = Game()
        player_ids = await add_players(game, 6)
        await game.start()
        
        # Set up scenario: 1 wolf, 1 non-wolf alive
        # Kill everyone except 1 wolf and 1 villager
        wolves = get_players_by_role(game, Role.WEREWOLF)
        non_wolves = [p for p in game.players.values() if p.role != Role.WEREWOLF]
        
        # Keep 1 wolf alive
        for wolf in wolves[1:]:
            kill_player(game, wolf.id)
        
        # Keep only 1 non-wolf alive
        for nw in non_wolves[1:]:
            kill_player(game, nw.id)
        
        winner = game._check_winner()
        assert winner == "werewolves"

    @pytest.mark.asyncio
    async def test_werewolves_win_when_more_than_nonwolves(self):
        """Werewolves should win when wolves > non-wolves."""
        game = Game()
        player_ids = await add_players(game, 8)  # 2 werewolves
        await game.start()
        
        wolves = get_players_by_role(game, Role.WEREWOLF)
        non_wolves = [p for p in game.players.values() if p.role != Role.WEREWOLF]
        
        # Keep 2 wolves, 1 non-wolf
        for nw in non_wolves[1:]:
            kill_player(game, nw.id)
        
        winner = game._check_winner()
        assert winner == "werewolves"


class TestNobodyWins:
    """Test nobody wins condition."""

    @pytest.mark.asyncio
    async def test_nobody_wins_when_all_dead(self):
        """Nobody should win when all players are dead."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        # Kill everyone
        for pid in player_ids:
            kill_player(game, pid)
        
        winner = game._check_winner()
        assert winner == "nobody"


class TestGameNotOver:
    """Test that game doesn't end prematurely."""

    @pytest.mark.asyncio
    async def test_no_winner_in_lobby(self):
        """No winner should be declared in LOBBY phase."""
        game = Game()
        await add_players(game, 5)
        
        winner = game._check_winner()
        assert winner is None

    @pytest.mark.asyncio
    async def test_no_winner_when_game_balanced(self):
        """No winner when there are more non-wolves than wolves."""
        game = Game()
        player_ids = await add_players(game, 8)  # 2 werewolves
        await game.start()
        
        # Don't kill anyone - should still be balanced
        winner = game._check_winner()
        assert winner is None

    @pytest.mark.asyncio
    async def test_no_winner_with_one_wolf_and_two_villagers(self):
        """No winner when 1 wolf and 2 non-wolves are alive."""
        game = Game()
        player_ids = await add_players(game, 6)
        await game.start()
        
        wolves = get_players_by_role(game, Role.WEREWOLF)
        non_wolves = [p for p in game.players.values() if p.role != Role.WEREWOLF]
        
        # Keep 1 wolf and 2 non-wolves
        for wolf in wolves[1:]:
            kill_player(game, wolf.id)
        for nw in non_wolves[2:]:
            kill_player(game, nw.id)
        
        winner = game._check_winner()
        assert winner is None
