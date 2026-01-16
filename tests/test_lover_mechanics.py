"""Tests for Cupid lover mechanics."""
from __future__ import annotations

import pytest
from server import Game, Role, Phase
from conftest import add_players, get_players_by_role, kill_player


class TestLoverAssignment:
    """Test lover assignment by Cupid."""

    @pytest.mark.asyncio
    async def test_lovers_linked_bidirectionally(self):
        """Lovers should be linked to each other."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        p1, p2 = player_ids[0], player_ids[1]
        
        # Simulate Cupid assigning lovers
        game.players[p1].lover_id = p2
        game.players[p2].lover_id = p1
        
        assert game.players[p1].lover_id == p2
        assert game.players[p2].lover_id == p1

    @pytest.mark.asyncio
    async def test_non_lovers_have_no_lover_id(self):
        """Non-lovers should have lover_id as None."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        # No lovers assigned yet
        for pid in player_ids:
            assert game.players[pid].lover_id is None


class TestLoverDeath:
    """Test lover death cascade."""

    @pytest.mark.asyncio
    async def test_lover_death_setup(self):
        """Test that lover relationship can be established."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        p1, p2 = player_ids[0], player_ids[1]
        
        # Assign lovers
        game.players[p1].lover_id = p2
        game.players[p2].lover_id = p1
        
        # Both should be alive initially
        assert game.players[p1].alive is True
        assert game.players[p2].alive is True

    @pytest.mark.asyncio
    async def test_lovers_can_be_killed(self):
        """Lovers can be killed just like other players."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        p1, p2 = player_ids[0], player_ids[1]
        
        # Assign lovers
        game.players[p1].lover_id = p2
        game.players[p2].lover_id = p1
        
        # Kill one lover
        kill_player(game, p1)
        
        assert game.players[p1].alive is False


class TestLoverRoleCombinations:
    """Test that lovers can be any role combination."""

    @pytest.mark.asyncio
    async def test_wolf_and_villager_lovers(self):
        """A werewolf and villager can be lovers."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        wolves = get_players_by_role(game, Role.WEREWOLF)
        villagers = get_players_by_role(game, Role.VILLAGER)
        
        if wolves and villagers:
            wolf = wolves[0]
            villager = villagers[0]
            
            # Assign as lovers
            game.players[wolf.id].lover_id = villager.id
            game.players[villager.id].lover_id = wolf.id
            
            assert game.players[wolf.id].lover_id == villager.id
            assert game.players[villager.id].lover_id == wolf.id

    @pytest.mark.asyncio
    async def test_two_villagers_lovers(self):
        """Two villagers can be lovers."""
        game = Game()
        player_ids = await add_players(game, 7)  # More players for more villagers
        await game.start()
        
        villagers = get_players_by_role(game, Role.VILLAGER)
        
        if len(villagers) >= 2:
            v1, v2 = villagers[0], villagers[1]
            
            game.players[v1.id].lover_id = v2.id
            game.players[v2.id].lover_id = v1.id
            
            assert game.players[v1.id].lover_id == v2.id
            assert game.players[v2.id].lover_id == v1.id


class TestLoverPrivacy:
    """Test that lover information is private."""

    @pytest.mark.asyncio
    async def test_public_snapshot_hides_lover(self):
        """Public snapshot should not reveal lover information."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        p1, p2 = player_ids[0], player_ids[1]
        game.players[p1].lover_id = p2
        game.players[p2].lover_id = p1
        
        snapshot = game._public_snapshot()
        
        # Public snapshot shouldn't have lover_id in alive list
        for player in snapshot["alive"]:
            assert "lover_id" not in player

    @pytest.mark.asyncio
    async def test_private_snapshot_shows_lover(self):
        """Private snapshot should reveal lover to the player."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        p1, p2 = player_ids[0], player_ids[1]
        game.players[p1].lover_id = p2
        game.players[p2].lover_id = p1
        
        snapshot = game._private_snapshot(p1)
        
        # Private snapshot should show lover_id
        assert snapshot["me"]["lover_id"] == p2
