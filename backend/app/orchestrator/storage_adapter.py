"""
Unified Storage Adapter / 统一存储适配器
Adapts individual storage components to the interface required by SelectEngine
适配各独立存储组件以满足 SelectEngine 的接口需求
"""

from typing import List, Optional, Any, Dict

class UnifiedStorageAdapter:
    """
    Adapter to expose a unified interface for SelectEngine
    适配器：为 SelectEngine 暴露统一接口
    """
    def __init__(self, card_storage, canon_storage, draft_storage):
        self.card = card_storage
        self.canon = canon_storage
        self.draft = draft_storage
    
    # Delegate methods required by SelectEngine
    
    async def get_style_card(self, project_id: str) -> Optional[Dict]:
        return await self.card.get_style_card(project_id)
        
    async def list_character_cards(self, project_id: str) -> List[str]:
        return await self.card.list_character_cards(project_id)
        
    async def get_character_card(self, project_id: str, name: str) -> Optional[Dict]:
        return await self.card.get_character_card(project_id, name)
        
    async def list_world_cards(self, project_id: str) -> List[str]:
        return await self.card.list_world_cards(project_id)
        
    async def get_world_card(self, project_id: str, name: str) -> Optional[Dict]:
        return await self.card.get_world_card(project_id, name)
        
    async def get_all_facts(self, project_id: str) -> List[Any]:
        return await self.canon.get_all_facts(project_id)
        
    async def get_scene_brief(self, project_id: str, chapter: str) -> Optional[Dict]:
        return await self.draft.get_scene_brief(project_id, chapter)
        
    async def get_review(self, project_id: str, chapter: str) -> Optional[Dict]:
        return await self.draft.get_review(project_id, chapter)

    async def search_text_chunks(
        self,
        project_id: str,
        query: str,
        limit: int = 5
    ) -> List[Dict]:
        if hasattr(self.draft, "search_text_chunks"):
            return await self.draft.search_text_chunks(project_id, query, limit=limit)
        return []
