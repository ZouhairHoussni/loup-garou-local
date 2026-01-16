"""Tests for role assignment rules following official Loup-Garou proportions."""
from __future__ import annotations

import pytest
from server import Game, Role, get_werewolf_count, UNIQUE_ROLES
from conftest import add_players, count_roles, get_players_by_role


class TestWerewolfCount:
    """Test werewolf count based on player count."""

    @pytest.mark.asyncio
    async def test_5_players_1_werewolf(self):
        """5 players should have exactly 1 werewolf."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.WEREWOLF, 0) == 1

    @pytest.mark.asyncio
    async def test_7_players_1_werewolf(self):
        """7 players should have exactly 1 werewolf."""
        game = Game()
        await add_players(game, 7)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.WEREWOLF, 0) == 1

    @pytest.mark.asyncio
    async def test_8_players_2_werewolves(self):
        """8 players should have exactly 2 werewolves."""
        game = Game()
        await add_players(game, 8)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.WEREWOLF, 0) == 2

    @pytest.mark.asyncio
    async def test_11_players_2_werewolves(self):
        """11 players should have exactly 2 werewolves."""
        game = Game()
        await add_players(game, 11)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.WEREWOLF, 0) == 2

    @pytest.mark.asyncio
    async def test_12_players_3_werewolves(self):
        """12 players should have exactly 3 werewolves."""
        game = Game()
        await add_players(game, 12)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.WEREWOLF, 0) == 3

    @pytest.mark.asyncio
    async def test_15_players_3_werewolves(self):
        """15 players should have exactly 3 werewolves."""
        game = Game()
        await add_players(game, 15)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.WEREWOLF, 0) == 3

    @pytest.mark.asyncio
    async def test_16_players_4_werewolves(self):
        """16 players should have exactly 4 werewolves."""
        game = Game()
        await add_players(game, 16)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.WEREWOLF, 0) == 4


class TestUniqueRoles:
    """Test that special roles appear at most once."""

    @pytest.mark.asyncio
    async def test_only_one_seer(self):
        """There should be at most 1 Seer."""
        game = Game()
        await add_players(game, 10)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.SEER, 0) <= 1

    @pytest.mark.asyncio
    async def test_only_one_witch(self):
        """There should be at most 1 Witch."""
        game = Game()
        await add_players(game, 10)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.WITCH, 0) <= 1

    @pytest.mark.asyncio
    async def test_only_one_cupid(self):
        """There should be at most 1 Cupid."""
        game = Game()
        await add_players(game, 10)
        await game.start()
        
        roles = count_roles(game)
        assert roles.get(Role.CUPID, 0) <= 1

    @pytest.mark.asyncio
    async def test_unique_roles_with_many_players(self):
        """Even with 20 players, unique roles should only appear once."""
        game = Game()
        await add_players(game, 20)
        await game.start()
        
        roles = count_roles(game)
        for role in UNIQUE_ROLES:
            assert roles.get(role, 0) <= 1, f"{role} should appear at most once"


class TestAllPlayersGetRoles:
    """Test that all players receive a role."""

    @pytest.mark.asyncio
    async def test_all_players_have_roles(self):
        """All players should receive a role after game starts."""
        game = Game()
        await add_players(game, 8)
        await game.start()
        
        for player in game.players.values():
            assert player.role is not None, f"Player {player.name} has no role"

    @pytest.mark.asyncio
    async def test_remaining_players_are_villagers(self):
        """Players not assigned special roles should be Villagers."""
        game = Game()
        await add_players(game, 10)
        await game.start()
        
        roles = count_roles(game)
        total_special = (
            roles.get(Role.WEREWOLF, 0) +
            roles.get(Role.SEER, 0) +
            roles.get(Role.WITCH, 0) +
            roles.get(Role.CUPID, 0)
        )
        expected_villagers = 10 - total_special
        assert roles.get(Role.VILLAGER, 0) == expected_villagers


class TestGetWerewolfCount:
    """Test the get_werewolf_count helper function."""

    def test_5_players(self):
        assert get_werewolf_count(5) == 1

    def test_7_players(self):
        assert get_werewolf_count(7) == 1

    def test_8_players(self):
        assert get_werewolf_count(8) == 2

    def test_11_players(self):
        assert get_werewolf_count(11) == 2

    def test_12_players(self):
        assert get_werewolf_count(12) == 3

    def test_15_players(self):
        assert get_werewolf_count(15) == 3

    def test_16_players(self):
        assert get_werewolf_count(16) == 4

    def test_20_players(self):
        assert get_werewolf_count(20) == 4


class TestMinimumPlayers:
    """Test minimum player requirements."""

    @pytest.mark.asyncio
    async def test_cannot_start_with_4_players(self):
        """Game should not start with fewer than 5 players."""
        game = Game()
        await add_players(game, 4)
        
        with pytest.raises(ValueError, match="at least 5 players"):
            await game.start()

    @pytest.mark.asyncio
    async def test_can_start_with_5_players(self):
        """Game should start with exactly 5 players."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        assert game.state.started is True
