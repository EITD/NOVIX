from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, AsyncGenerator


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers / 大模型提供商抽象基类"""
    
    def __init__(
        self,
        api_key: str,
        model: str,
        max_tokens: int = 8000,
        temperature: float = 0.7
    ):
        """
        Initialize provider
        
        Args:
            api_key: API key for the provider / API密钥
            model: Model name / 模型名称
            max_tokens: Maximum tokens to generate / 最大生成token数
            temperature: Temperature for generation / 生成温度
        """
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
    
    @abstractmethod
    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Send chat request to LLM provider
        发送聊天请求到大模型提供商
        
        Args:
            messages: List of messages in format [{"role": "user", "content": "..."}]
                     消息列表
            temperature: Override temperature / 覆盖温度设置
            max_tokens: Override max tokens / 覆盖最大token数
            
        Returns:
            Response dict with 'content', 'usage', etc.
            包含'content'、'usage'等的响应字典
        """
        pass
    
    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat response token by token
        流式输出聊天响应，逐 token 返回
        
        Args:
            messages: List of messages / 消息列表
            temperature: Override temperature / 覆盖温度
            max_tokens: Override max tokens / 覆盖最大token数
            
        Yields:
            String chunks as they arrive from the LLM
            从大模型返回的字符串片段
        """
        # Default implementation: fall back to non-streaming and yield full content
        # Subclasses should override this for true streaming
        response = await self.chat(messages, temperature, max_tokens)
        yield response.get("content", "")
    
    @abstractmethod
    def get_provider_name(self) -> str:
        """Get provider name / 获取提供商名称"""
        pass
