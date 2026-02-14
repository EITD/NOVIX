# -*- coding: utf-8 -*-
"""
文枢 WenShape - 深度上下文感知的智能体小说创作系统
WenShape - Deep Context-Aware Agent-Based Novel Writing System

Copyright © 2025-2026 WenShape Team
License: PolyForm Noncommercial License 1.0.0

模块说明 / Module Description:
  集中式日志系统 - 提供统一的日志配置和管理
  Centralized Logging Module - Unified logging configuration and management

使用示例 / Usage:
    from app.utils.logger import get_logger

    logger = get_logger(__name__)
    logger.info("应用启动 / Application started")
    logger.debug("调试信息 / Debug information")
    logger.error("错误发生 / Error occurred", exc_info=True)
"""

import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler
from app.config import settings

# Create logs directory if it doesn't exist
# 如果日志目录不存在则创建
if getattr(sys, 'frozen', False):
    # Frozen mode (EXE) - logs next to executable
    # 冻结模式（EXE）- 日志在可执行文件旁
    log_dir = Path(sys.executable).parent / "logs"
else:
    # Dev mode - logs in backend directory
    # 开发模式 - 日志在 backend 目录
    log_dir = Path(__file__).parent.parent.parent / "logs"

log_dir.mkdir(exist_ok=True)

# Define log format
# 定义日志格式
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

def get_logger(name: str) -> logging.Logger:
    """
    获取或创建指定名称的logger

    Get or create a logger with the specified name.

    创建一个配置有控制台处理器（Console Handler）和文件处理器（File Handler）的logger。
    File handler使用rotating file handler，最大10MB，保留5个备份文件。
    Creates a logger with console and file handlers. File handler uses rotating
    file handler with 10MB max size and 5 backup files.

    Args:
        name: Logger名称，通常为 __name__ / Logger name (typically __name__)

    Returns:
        配置好的logger实例 / Configured logger instance

    Example:
        >>> logger = get_logger(__name__)
        >>> logger.info("信息消息 / Info message")
    """
    logger = logging.getLogger(name)

    # Avoid adding handlers multiple times
    # 避免多次添加处理器
    if logger.handlers:
        return logger

    # Set level based on debug mode
    # 根据调试模式设置日志级别
    logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

    # Console Handler (always enabled)
    # 控制台处理器（总是启用）
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG if settings.debug else logging.INFO)
    console_formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # File Handler (rotating, max 10MB, keep 5 backups)
    # 文件处理器（轮转，最大10MB，保留5个备份）
    file_handler = RotatingFileHandler(
        log_dir / "wenshape.log",
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)
    file_formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)
    
    return logger


# Module-level initialization
# 模块级初始化
_logger = get_logger(__name__)
_logger.info("日志系统已初始化 / Logging system initialized")
