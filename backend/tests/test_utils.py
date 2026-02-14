"""Test utilities in app.utils.*"""
import pytest
from app.utils.text import normalize_newlines, normalize_for_compare
from app.utils.path_safety import sanitize_id, validate_path_within
from pathlib import Path


# --- normalize_newlines ---

class TestNormalizeNewlines:
    def test_none_returns_empty(self):
        assert normalize_newlines(None) == ""

    def test_empty_string(self):
        assert normalize_newlines("") == ""

    def test_crlf(self):
        assert normalize_newlines("a\r\nb") == "a\nb"

    def test_cr(self):
        assert normalize_newlines("a\rb") == "a\nb"

    def test_mixed(self):
        assert normalize_newlines("a\r\nb\rc\nd") == "a\nb\nc\nd"


# --- normalize_for_compare ---

class TestNormalizeForCompare:
    def test_strips_trailing(self):
        assert normalize_for_compare("hello\r\n  ") == "hello"

    def test_none(self):
        assert normalize_for_compare(None) == ""


# --- sanitize_id ---

class TestSanitizeId:
    def test_simple(self):
        assert sanitize_id("hello") == "hello"

    def test_spaces_to_underscores(self):
        assert sanitize_id("my project") == "my_project"

    def test_traversal_removed(self):
        result = sanitize_id("../../etc/passwd")
        assert ".." not in result
        assert "/" not in result
        assert "\\" not in result

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            sanitize_id("")

    def test_none_raises(self):
        with pytest.raises(ValueError):
            sanitize_id(None)

    def test_dots_only_raises(self):
        with pytest.raises(ValueError):
            sanitize_id("...")

    def test_max_length(self):
        long_id = "a" * 100
        result = sanitize_id(long_id, max_length=10)
        assert len(result) <= 10

    def test_chinese_preserved(self):
        result = sanitize_id("我的项目")
        assert "我的项目" == result


# --- validate_path_within ---

class TestValidatePathWithin:
    def test_valid_child(self, tmp_path):
        child = tmp_path / "sub" / "file.txt"
        child.parent.mkdir(parents=True, exist_ok=True)
        child.touch()
        result = validate_path_within(child, tmp_path)
        assert result == child.resolve()

    def test_traversal_rejected(self, tmp_path):
        evil = tmp_path / ".." / "etc" / "passwd"
        with pytest.raises(ValueError, match="escapes"):
            validate_path_within(evil, tmp_path)
