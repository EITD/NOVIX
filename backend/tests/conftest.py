"""Pytest configuration for WenShape backend tests."""
import sys
from pathlib import Path

# Ensure the backend package is importable
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))
