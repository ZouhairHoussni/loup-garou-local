"""Tests for day voting phase."""
from __future__ import annotations

import pytest
from server import Game, Role, Phase
from conftest import add_players, get_players_by_role, kill_player


class TestVoteCasting:
    """Test vote casting mechanics."""

    @pytest.mark.asyncio
    async def test_player_can_cast_vote(self):
        """Alive player should be able to cast a vote."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        # Set up vote phase
        game.state.phase = Phase.VOTE
        game.state.vote_box.deadline = float('inf')  # No timeout for test
        
        voter = player_ids[0]
        target = player_ids[1]
        
        await game.cast_vote(voter, target)
        
        assert game.state.vote_box.votes.get(voter) == target

    @pytest.mark.asyncio
    async def test_dead_player_cannot_vote(self):
        """Dead player should not be able to cast a vote."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        game.state.phase = Phase.VOTE
        game.state.vote_box.deadline = float('inf')
        
        voter = player_ids[0]
        target = player_ids[1]
        
        # Kill the voter
        kill_player(game, voter)
        
        await game.cast_vote(voter, target)
        
        # Vote should not be recorded
        assert voter not in game.state.vote_box.votes

    @pytest.mark.asyncio
    async def test_cannot_vote_for_dead_player(self):
        """Cannot vote for a dead player."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        game.state.phase = Phase.VOTE
        game.state.vote_box.deadline = float('inf')
        
        voter = player_ids[0]
        target = player_ids[1]
        
        # Kill the target
        kill_player(game, target)
        
        await game.cast_vote(voter, target)
        
        # Vote should not be recorded
        assert voter not in game.state.vote_box.votes

    @pytest.mark.asyncio
    async def test_vote_only_during_vote_phase(self):
        """Votes should only be accepted during VOTE phase."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        # Not in vote phase
        game.state.phase = Phase.NIGHT
        
        voter = player_ids[0]
        target = player_ids[1]
        
        await game.cast_vote(voter, target)
        
        # Vote should not be recorded
        assert voter not in game.state.vote_box.votes


class TestVoteTally:
    """Test vote tallying and elimination."""

    @pytest.mark.asyncio
    async def test_votes_are_recorded(self):
        """Multiple votes should be recorded correctly."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        game.state.phase = Phase.VOTE
        game.state.vote_box.deadline = float('inf')
        
        # All vote for player_ids[4]
        for i in range(4):
            await game.cast_vote(player_ids[i], player_ids[4])
        
        assert len(game.state.vote_box.votes) == 4

    @pytest.mark.asyncio
    async def test_player_can_change_vote(self):
        """Player should be able to change their vote."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        game.state.phase = Phase.VOTE
        game.state.vote_box.deadline = float('inf')
        
        voter = player_ids[0]
        
        # First vote
        await game.cast_vote(voter, player_ids[1])
        assert game.state.vote_box.votes[voter] == player_ids[1]
        
        # Change vote
        await game.cast_vote(voter, player_ids[2])
        assert game.state.vote_box.votes[voter] == player_ids[2]


class TestVotePhaseStart:
    """Test vote phase initialization."""

    @pytest.mark.asyncio
    async def test_vote_box_starts_empty(self):
        """Vote box should start empty."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        assert len(game.state.vote_box.votes) == 0
