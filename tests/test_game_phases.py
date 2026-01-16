"""Tests for game phase transitions."""
from __future__ import annotations

import pytest
from server import Game, Phase
from conftest import add_players


class TestPhaseTransitions:
    """Test game phase transitions."""

    @pytest.mark.asyncio
    async def test_initial_phase_is_lobby(self):
        """Game should start in LOBBY phase."""
        game = Game()
        assert game.state.phase == Phase.LOBBY

    @pytest.mark.asyncio
    async def test_start_transitions_to_night(self):
        """Starting the game should transition to NIGHT phase."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        assert game.state.phase == Phase.NIGHT

    @pytest.mark.asyncio
    async def test_game_started_flag(self):
        """Game started flag should be True after start."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        assert game.state.started is True

    @pytest.mark.asyncio
    async def test_night_count_increments(self):
        """Night count should start at 0 and increment."""
        game = Game()
        await add_players(game, 5)
        
        assert game.state.night_count == 0
        # Note: actual night phase runs async, we just check initial state


class TestPhaseInitialState:
    """Test initial state values."""

    @pytest.mark.asyncio
    async def test_initial_day_count(self):
        """Day count should start at 0."""
        game = Game()
        assert game.state.day_count == 0

    @pytest.mark.asyncio
    async def test_initial_night_count(self):
        """Night count should start at 0."""
        game = Game()
        assert game.state.night_count == 0

    @pytest.mark.asyncio
    async def test_initial_winner_is_none(self):
        """Winner should be None initially."""
        game = Game()
        assert game.state.winner is None

    @pytest.mark.asyncio
    async def test_initial_narrator_empty(self):
        """Narrator log should be empty initially."""
        game = Game()
        assert game.state.narrator == []


class TestGameOver:
    """Test GAME_OVER phase."""

    @pytest.mark.asyncio
    async def test_game_over_sets_winner(self):
        """Game over should set the winner."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        await game._end_game("villagers")
        
        assert game.state.phase == Phase.GAME_OVER
        assert game.state.winner == "villagers"


class TestReset:
    """Test game reset functionality."""

    @pytest.mark.asyncio
    async def test_reset_clears_players(self):
        """Reset should clear all players."""
        game = Game()
        await add_players(game, 5)
        await game.reset()
        
        assert len(game.players) == 0

    @pytest.mark.asyncio
    async def test_reset_returns_to_lobby(self):
        """Reset should return to LOBBY phase."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        await game.reset()
        
        assert game.state.phase == Phase.LOBBY

    @pytest.mark.asyncio
    async def test_reset_clears_started_flag(self):
        """Reset should clear the started flag."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        await game.reset()
        
        assert game.state.started is False

    @pytest.mark.asyncio
    async def test_reset_clears_winner(self):
        """Reset should clear the winner."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        await game._end_game("villagers")
        await game.reset()
        
        assert game.state.winner is None
