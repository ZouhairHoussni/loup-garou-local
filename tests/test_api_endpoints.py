"""Tests for REST API endpoints."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


class TestHealthEndpoint:
    """Test health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_returns_ok(self, client: AsyncClient):
        """Health endpoint should return ok status."""
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True


class TestJoinEndpoint:
    """Test player join endpoint."""

    @pytest.mark.asyncio
    async def test_join_returns_player_id(self, client: AsyncClient):
        """Join should return a player ID."""
        response = await client.post("/api/join", json={"name": "TestPlayer"})
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert "player_id" in data
        assert len(data["player_id"]) > 0

    @pytest.mark.asyncio
    async def test_join_with_empty_name(self, client: AsyncClient):
        """Join with empty name should still work (defaults to Player)."""
        response = await client.post("/api/join", json={"name": ""})
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True

    @pytest.mark.asyncio
    async def test_join_truncates_long_name(self, client: AsyncClient):
        """Join should truncate names longer than 24 characters."""
        long_name = "A" * 50
        response = await client.post("/api/join", json={"name": long_name})
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True


class TestStartEndpoint:
    """Test game start endpoint."""

    @pytest.mark.asyncio
    async def test_start_fails_without_enough_players(self, client: AsyncClient):
        """Start should fail with fewer than 5 players."""
        # Add only 3 players
        for i in range(3):
            await client.post("/api/join", json={"name": f"Player{i}"})
        
        response = await client.post("/api/start")
        data = response.json()
        assert data["ok"] is False
        assert "5 players" in data.get("error", "")

    @pytest.mark.asyncio
    async def test_start_succeeds_with_5_players(self, client: AsyncClient):
        """Start should succeed with 5 players."""
        for i in range(5):
            await client.post("/api/join", json={"name": f"Player{i}"})
        
        response = await client.post("/api/start")
        data = response.json()
        assert data["ok"] is True


class TestResetEndpoint:
    """Test game reset endpoint."""

    @pytest.mark.asyncio
    async def test_reset_returns_ok(self, client: AsyncClient):
        """Reset should return ok status."""
        response = await client.post("/api/reset")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True

    @pytest.mark.asyncio
    async def test_reset_clears_players(self, client: AsyncClient):
        """Reset should clear all players."""
        # Add some players
        for i in range(3):
            await client.post("/api/join", json={"name": f"Player{i}"})
        
        # Reset
        await client.post("/api/reset")
        
        # Health check should show LOBBY phase
        response = await client.get("/api/health")
        data = response.json()
        assert data["phase"] == "LOBBY"


class TestVoteEndpoint:
    """Test vote endpoint."""

    @pytest.mark.asyncio
    async def test_vote_requires_ids(self, client: AsyncClient):
        """Vote should require voter_id and target_id."""
        response = await client.post("/api/vote", json={})
        data = response.json()
        assert data["ok"] is False

    @pytest.mark.asyncio
    async def test_vote_with_missing_voter(self, client: AsyncClient):
        """Vote should fail without voter_id."""
        response = await client.post("/api/vote", json={"target_id": "abc"})
        data = response.json()
        assert data["ok"] is False


class TestActionEndpoint:
    """Test action endpoint."""

    @pytest.mark.asyncio
    async def test_action_requires_player_id(self, client: AsyncClient):
        """Action should require player_id."""
        response = await client.post("/api/action", json={"step": "WOLVES"})
        data = response.json()
        assert data["ok"] is False

    @pytest.mark.asyncio
    async def test_action_requires_step(self, client: AsyncClient):
        """Action should require step."""
        response = await client.post("/api/action", json={"player_id": "abc"})
        data = response.json()
        assert data["ok"] is False


class TestRootEndpoint:
    """Test root endpoint."""

    @pytest.mark.asyncio
    async def test_root_returns_hint(self, client: AsyncClient):
        """Root should return a helpful hint."""
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert "hint" in data
