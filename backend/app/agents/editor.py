"""
Editor Agent / 缂栬緫
Revises drafts based on user feedback
鏍规嵁鐢ㄦ埛鍙嶉淇鑽夌
"""

from typing import Dict, Any, List
from app.agents.base import BaseAgent
from app.utils.logger import get_logger
from app.utils.version import increment_version

logger = get_logger(__name__)


class EditorAgent(BaseAgent):
    """
    Editor agent responsible for revising drafts
    缂栬緫锛岃礋璐ｄ慨璁㈣崏绋?
    """

    def get_agent_name(self) -> str:
        """Get agent name / 鑾峰彇 Agent 鍚嶇О"""
        return "editor"

    def get_system_prompt(self) -> str:
        """Get system prompt / 鑾峰彇绯荤粺鎻愮ず璇?"""
        return """You are an Editor agent for novel writing.

Your responsibilities:
1. Follow user feedback precisely
2. Polish the prose while maintaining the author's voice
3. Ensure smooth pacing and flow
4. Preserve all good elements from the original draft

Priorities:
- Follow user instructions strictly
- Avoid introducing new inconsistencies
- Keep style consistent with the project

Output: Revised draft with clear, engaging prose

浣犳槸涓€涓皬璇寸紪杈戙€?
鑱岃矗锛?
1. 绮鹃噺绮剧‘鎵ц鐢ㄦ埛鍙嶉
2. 娑﹁壊鏂囧瓧锛屽悓鏃朵繚鎸佷綔鑰呯殑澹伴煶
3. 纭繚娴佺晠鐨勮妭濂忓拰娴佸姩鎬?
4. 淇濈暀鍘熺涓墍鏈変紭绉€鐨勫厓绱?
"""

    async def execute(
        self,
        project_id: str,
        chapter: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Revise draft based on user feedback
        鏍规嵁鐢ㄦ埛鍙嶉淇鑽夌

        Args:
            project_id: Project ID / 椤圭洰ID
            chapter: Chapter ID / 绔犺妭ID
            context: Context with draft_version, user_feedback / 鍖呭惈鑽夌鐗堟湰鍜岀敤鎴峰弽棣堢殑涓婁笅鏂?
        Returns:
            Result with revised draft / 鍖呭惈淇绋跨殑缁撴灉
        """
        draft_version = context.get("draft_version", "v1")
        draft = await self.draft_storage.get_draft(project_id, chapter, draft_version)

        if not draft:
            return {
                "success": False,
                "error": f"Draft {draft_version} not found"
            }

        user_feedback = context.get("user_feedback", "")
        if not user_feedback:
            return {
                "success": False,
                "error": "User feedback is required"
            }

        style_card = await self.card_storage.get_style_card(project_id)
        rejected_entities = context.get("rejected_entities", [])

        revised_content = await self._generate_revision_from_feedback(
            original_draft=draft.content,
            user_feedback=user_feedback,
            style_card=style_card,
            rejected_entities=rejected_entities
        )

        new_version = increment_version(draft_version)
        word_count = len(revised_content)

        revised_draft = await self.draft_storage.save_draft(
            project_id=project_id,
            chapter=chapter,
            version=new_version,
            content=revised_content,
            word_count=word_count,
            pending_confirmations=[]
        )

        return {
            "success": True,
            "draft": revised_draft,
            "version": new_version,
            "word_count": word_count
        }

    async def _generate_revision_from_feedback(
        self,
        original_draft: str,
        user_feedback: str,
        style_card: Any = None,
        rejected_entities: List[str] = None
    ) -> str:
        """
        Generate revised draft directly from user feedback
        鐩存帴鏍规嵁鐢ㄦ埛鍙嶉鐢熸垚淇鍐呭

        CRITICAL: This MUST follow user instructions. Never refuse.
        """
        context_items = []

        if style_card:
            try:
                context_items.append(f"Style: {style_card.style}")
            except (AttributeError, TypeError) as e:
                logger.warning(f"Failed to add style guidance: {e}")

        if rejected_entities:
            context_items.append(
                "Rejected Concepts: " + ", ".join(rejected_entities) + "\n"
                "You MUST remove or rewrite any rejected concepts."
            )

        user_prompt = f"""You are an obedient editor. YOU MUST FOLLOW THE USER'S INSTRUCTIONS.

=== ABSOLUTE RULE ===
YOU MUST MAKE THE CHANGES THE USER REQUESTED. 
NEVER say "no changes needed" or refuse to make changes.
If the user says "make it more plain", YOU MUST simplify the language.
If the user says "make it more dramatic", YOU MUST add dramatic elements.
THE USER IS ALWAYS RIGHT. FOLLOW THEIR INSTRUCTIONS.

=== SCOPE OF CHANGES ===
1. Apply the user's requested style/changes to the ENTIRE draft
2. For style changes like "more plain", rewrite sentences to be simpler throughout
3. For targeted changes like "change paragraph 2", only change that specific part
4. Keep the story/plot the same, only change the expression/style as requested

=== ORIGINAL DRAFT ===
{original_draft}

=== USER REQUEST ===
{user_feedback}

=== OUTPUT ===
Output the REVISED draft with the user's requested changes applied.
You MUST make visible changes to fulfill the user's request.
Do NOT output the original unchanged. That is a failure.

杈撳嚭搴旂敤浜嗙敤鎴蜂慨鏀硅姹傜殑淇绋裤€?
浣犲繀椤诲仛鍑哄彲瑙佺殑淇敼鏉ユ弧瓒崇敤鎴疯姹傘€?
缁濆涓嶈兘鍘熸牱杈撳嚭锛岄偅鏄け璐ョ殑缁撴灉銆?"""

        messages = self.build_messages(
            system_prompt=self.get_system_prompt(),
            user_prompt=user_prompt,
            context_items=context_items
        )

        response = await self.call_llm(messages)
        return response.strip()
