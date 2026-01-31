"""
Card data models.
"""

from pydantic import BaseModel, Field


class CharacterCard(BaseModel):
    """Character card."""

    name: str = Field(..., description="Character name")
    description: str = Field(..., description="Character description")


class WorldCard(BaseModel):
    """World card."""

    name: str = Field(..., description="Setting name")
    description: str = Field(..., description="Setting description")


class StyleCard(BaseModel):
    """Writing style card."""

    style: str = Field(..., description="Writing style requirements")
