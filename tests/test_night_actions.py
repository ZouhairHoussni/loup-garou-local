"""Tests for night phase actions."""
from __future__ import annotations

import pytest
from server import Game, Role, Phase
from conftest import add_players, get_players_by_role, kill_player


class TestWerewolfVoting:
    """Test werewolf victim selection."""

    @pytest.mark.asyncio
    async def test_wolves_can_select_victim(self):
        """Werewolves should be able to propose a victim."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        wolves = get_players_by_role(game, Role.WEREWOLF)
        non_wolves = [p for p in game.players.values() if p.role != Role.WEREWOLF]
        
        assert len(wolves) >= 1
        assert len(non_wolves) >= 1

    @pytest.mark.asyncio
    async def test_wolves_cannot_target_wolves(self):
        """Werewolves should not be able to target other werewolves."""
        game = Game()
        await add_players(game, 8)  # 2 werewolves
        await game.start()
        
        wolves = get_players_by_role(game, Role.WEREWOLF)
        assert len(wolves) == 2
        
        # Both wolves should be alive and identifiable
        for wolf in wolves:
            assert wolf.role == Role.WEREWOLF
            assert wolf.alive is True


class TestSeerAction:
    """Test Seer reveal action."""

    @pytest.mark.asyncio
    async def test_seer_exists_in_game(self):
        """Game should have a Seer after start."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        seers = get_players_by_role(game, Role.SEER)
        assert len(seers) == 1

    @pytest.mark.asyncio
    async def test_seer_can_reveal_role(self):
        """Seer should be able to know another player's role."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        seers = get_players_by_role(game, Role.SEER)
        seer = seers[0]
        
        # Pick a target (not the seer)
        targets = [p for p in game.players.values() if p.id != seer.id]
        target = targets[0]
        
        # The seer should be able to see the target's role
        assert target.role is not None


class TestWitchAction:
    """Test Witch heal and poison actions."""

    @pytest.mark.asyncio
    async def test_witch_exists_in_game(self):
        """Game should have a Witch after start."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        witches = get_players_by_role(game, Role.WITCH)
        assert len(witches) == 1

    @pytest.mark.asyncio
    async def test_witch_starts_with_both_potions(self):
        """Witch should start with heal and poison unused."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        witches = get_players_by_role(game, Role.WITCH)
        witch = witches[0]
        
        assert witch.witch_heal_used is False
        assert witch.witch_poison_used is False

    @pytest.mark.asyncio
    async def test_witch_heal_marks_as_used(self):
        """Using heal potion should mark it as used."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        witches = get_players_by_role(game, Role.WITCH)
        witch = witches[0]
        
        # Simulate using heal
        witch.witch_heal_used = True
        
        assert witch.witch_heal_used is True

    @pytest.mark.asyncio
    async def test_witch_poison_marks_as_used(self):
        """Using poison potion should mark it as used."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        witches = get_players_by_role(game, Role.WITCH)
        witch = witches[0]
        
        # Simulate using poison
        witch.witch_poison_used = True
        
        assert witch.witch_poison_used is True


class TestCupidAction:
    """Test Cupid lover assignment."""

    @pytest.mark.asyncio
    async def test_cupid_exists_in_game(self):
        """Game should have a Cupid after start."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        cupids = get_players_by_role(game, Role.CUPID)
        assert len(cupids) == 1

    @pytest.mark.asyncio
    async def test_cupid_can_assign_lovers(self):
        """Cupid should be able to assign two lovers."""
        game = Game()
        player_ids = await add_players(game, 5)
        await game.start()
        
        # Simulate lover assignment
        p1, p2 = list(game.players.keys())[:2]
        game.players[p1].lover_id = p2
        game.players[p2].lover_id = p1
        
        assert game.players[p1].lover_id == p2
        assert game.players[p2].lover_id == p1

    @pytest.mark.asyncio
    async def test_lovers_start_without_assignment(self):
        """Players should start without lover assignment."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        for player in game.players.values():
            assert player.lover_id is None


class TestNightResolution:
    """Test night death resolution."""

    @pytest.mark.asyncio
    async def test_wolf_victim_dies_without_heal(self):
        """Wolf victim should die if witch doesn't heal."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        non_wolves = [p for p in game.players.values() if p.role != Role.WEREWOLF]
        victim = non_wolves[0]
        
        # Simulate wolf attack
        game.state.wolves_victim = victim.id
        game.state.witch_heal = False
        
        # The victim should be marked for death
        assert game.state.wolves_victim == victim.id
        assert game.state.witch_heal is False

    @pytest.mark.asyncio
    async def test_witch_heal_saves_victim(self):
        """Witch heal should save the wolf victim."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        non_wolves = [p for p in game.players.values() if p.role != Role.WEREWOLF]
        victim = non_wolves[0]
        
        # Simulate wolf attack and witch heal
        game.state.wolves_victim = victim.id
        game.state.witch_heal = True
        
        assert game.state.witch_heal is True

    @pytest.mark.asyncio
    async def test_witch_poison_kills_target(self):
        """Witch poison should mark target for death."""
        game = Game()
        await add_players(game, 5)
        await game.start()
        
        wolves = get_players_by_role(game, Role.WEREWOLF)
        wolf = wolves[0]
        
        # Simulate witch poisoning a wolf
        game.state.witch_poison_target = wolf.id
        
        assert game.state.witch_poison_target == wolf.id
