"""
Cards router.
"""

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.schemas.card import CharacterCard, WorldCard, StyleCard
from app.storage import CardStorage, CanonStorage, DraftStorage
from app.llm_gateway import get_gateway
from app.agents import ArchivistAgent

router = APIRouter(prefix="/projects/{project_id}/cards", tags=["cards"])
card_storage = CardStorage()


class StyleExtractRequest(BaseModel):
    """Request body for style extraction."""

    content: str = Field(..., description="Sample text for style extraction")


@router.get("/characters")
async def list_character_cards(project_id: str) -> List[str]:
    """List all character card names."""
    return await card_storage.list_character_cards(project_id)


@router.get("/characters/{character_name}")
async def get_character_card(project_id: str, character_name: str):
    """Get a character card."""
    card = await card_storage.get_character_card(project_id, character_name)
    if not card:
        raise HTTPException(status_code=404, detail="Character card not found")
    return card


@router.post("/characters")
async def create_character_card(project_id: str, card: CharacterCard):
    """Create a character card."""
    await card_storage.save_character_card(project_id, card)
    return {"success": True, "message": "Character card created"}


@router.put("/characters/{character_name}")
async def update_character_card(project_id: str, character_name: str, card: CharacterCard):
    """Update a character card."""
    card.name = character_name
    await card_storage.save_character_card(project_id, card)
    return {"success": True, "message": "Character card updated"}


@router.delete("/characters/{character_name}")
async def delete_character_card(project_id: str, character_name: str):
    """Delete a character card."""
    success = await card_storage.delete_character_card(project_id, character_name)
    if not success:
        raise HTTPException(status_code=404, detail="Character card not found")
    return {"success": True, "message": "Character card deleted"}


@router.get("/world")
async def list_world_cards(project_id: str) -> List[str]:
    """List all world card names."""
    return await card_storage.list_world_cards(project_id)


@router.get("/world/{card_name}")
async def get_world_card(project_id: str, card_name: str):
    """Get a world card."""
    card = await card_storage.get_world_card(project_id, card_name)
    if not card:
        raise HTTPException(status_code=404, detail="World card not found")
    return card


@router.post("/world")
async def create_world_card(project_id: str, card: WorldCard):
    """Create a world card."""
    await card_storage.save_world_card(project_id, card)
    return {"success": True, "message": "World card created"}


@router.put("/world/{card_name}")
async def update_world_card(project_id: str, card_name: str, card: WorldCard):
    """Update a world card."""
    card.name = card_name
    await card_storage.save_world_card(project_id, card)
    return {"success": True, "message": "World card updated"}


@router.get("/style")
async def get_style_card(project_id: str):
    """Get style card."""
    card = await card_storage.get_style_card(project_id)
    if not card:
        raise HTTPException(status_code=404, detail="Style card not found")
    return card


@router.put("/style")
async def update_style_card(project_id: str, card: StyleCard):
    """Update style card."""
    await card_storage.save_style_card(project_id, card)
    return {"success": True, "message": "Style card updated"}


@router.post("/style/extract")
async def extract_style_card(project_id: str, request: StyleExtractRequest):
    """Extract style guidance from sample text."""
    content = (request.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    gateway = get_gateway()
    archivist = ArchivistAgent(
        gateway,
        card_storage,
        CanonStorage(),
        DraftStorage(),
    )
    style_text = await archivist.extract_style_profile(content)
    return {"style": style_text}
