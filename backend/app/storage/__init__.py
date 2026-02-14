"""
Storage Module / 存储模块
File-based storage operations for cards, canon, drafts
基于文件的存储操作（卡片、事实表、草稿）
"""

from .cards import CardStorage
from .canon import CanonStorage
from .drafts import DraftStorage
from .evidence_index import EvidenceIndexStorage
from .bindings import ChapterBindingStorage
from .memory_pack import MemoryPackStorage

__all__ = [
    "CardStorage",
    "CanonStorage",
    "DraftStorage",
    "EvidenceIndexStorage",
    "ChapterBindingStorage",
    "MemoryPackStorage",
]
