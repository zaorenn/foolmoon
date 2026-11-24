"""Comprehensive test suite for Foolmoon's elevated Personal Assistant capabilities."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import lz4.block
import pymupdf
import pytest

from mcp_servers import _assistant_workbench as wb
from mcp_servers import _browser_discovery as bd
from mcp_servers import _document_studio as ds


def _make_mozlz4(payload: object) -> bytes:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return b"mozLz40\x00" + lz4.block.compress(raw)


def _create_fake_gecko_profile(root: Path, active_folder: str = "abcd1234.Default (release)") -> Path:
    prof_active = root / "Profiles" / active_folder
    prof_empty = root / "Profiles" / "0000empty.Default Profile"
    prof_active.mkdir(parents=True, exist_ok=True)
    prof_empty.mkdir(parents=True, exist_ok=True)

    (root / "profiles.ini").write_text(
        f"""[General]
StartWithLastProfile=1
Version=2

[Profile0]
Name=Default (release)
IsRelative=1
Path=Profiles/{active_folder}

[InstallC8A7FE9AC4B8F560]
Default=Profiles/{active_folder}
Locked=1

[Profile1]
Name=Default Profile
IsRelative=1
Path=Profiles/0000empty.Default Profile
Default=1
""",
        encoding="utf-8",
    )

    # Create places.sqlite with bookmarks, history, and downloads
    places = prof_active / "places.sqlite"
    conn = sqlite3.connect(str(places))
    conn.executescript(
        """
        CREATE TABLE moz_places (
            id INTEGER PRIMARY KEY,
            url TEXT,
            title TEXT,
            visit_count INTEGER DEFAULT 1,
            hidden INTEGER DEFAULT 0,
            last_visit_date INTEGER
        );
        CREATE TABLE moz_bookmarks (
            id INTEGER PRIMARY KEY,
            type INTEGER,
            fk INTEGER,
            parent INTEGER,
            title TEXT,
            dateAdded INTEGER
        );
        CREATE TABLE moz_annos (
            id INTEGER PRIMARY KEY,
            place_id INTEGER,
            content TEXT,
            dateAdded INTEGER
        );
        INSERT INTO moz_places(id, url, title, visit_count, hidden, last_visit_date) VALUES
            (1, 'https://arxiv.org/abs/2401.00001?token=secret123', 'Akademik Makale', 5, 0, 1732400000000000),
            (2, 'https://music.youtube.com/watch?v=abc', 'Favori Şarkım', 9, 0, 1732390000000000);
        INSERT INTO moz_bookmarks(id, type, fk, parent, title, dateAdded) VALUES
            (10, 2, NULL, NULL, 'Araştırma', 1732300000000000),
            (11, 1, 1, 10, 'Önemli Makale', 1732310000000000);
        INSERT INTO moz_annos(id, place_id, content, dateAdded) VALUES
            (1, 1, 'paper.pdf', 1732320000000000);
        """
    )
    conn.commit()
    conn.close()

    # Deliberately include sensitive files + a cookies key inside recovery.jsonlz4 to assert strict non-exposure
    (prof_active / "logins.json").write_text('{"logins":[{"password":"TOP_SECRET_PASSWORD"}]}', encoding="utf-8")
    (prof_active / "cookies.sqlite").write_text("SECRET_COOKIE_DATA", encoding="utf-8")

    sess_dir = prof_active / "sessionstore-backups"
    sess_dir.mkdir(parents=True, exist_ok=True)
    session_payload = {
        "cookies": [{"name": "SID", "value": "MUST_NEVER_BE_RETURNED"}],
        "windows": [
            {
                "spaces": [{"uuid": "ws-1", "name": "Ders Çalışma"}],
                "tabs": [
                    {
                        "pinned": True,
                        "zenWorkspace": "ws-1",
                        "lastAccessed": 1732400000000,
                        "entries": [{"url": "https://docs.python.org/3/?auth=xyz999", "title": "Python Docs"}],
                    }
                ],
            }
        ],
    }
    (sess_dir / "recovery.jsonlz4").write_bytes(_make_mozlz4(session_payload))
    return prof_active


def test_gecko_install_profile_resolution_and_privacy_guard(tmp_path, monkeypatch):
    zen_root = tmp_path / "zen"
    active = _create_fake_gecko_profile(zen_root)

    # Install section must beat stale Profile1 Default=1!
    resolved = bd.resolve_gecko_profile(zen_root)
    assert resolved == active.resolve()

    fake_discovery = {
        "default_browser": {"id": "zen", "name": "Zen Browser", "engine": "gecko"},
        "count": 1,
        "browsers": [
            {
                "id": "zen",
                "name": "Zen Browser",
                "engine": "gecko",
                "is_default": True,
                "executable": "",
                "profile_path": str(active),
                "available_data": ["tabs", "bookmarks", "history", "downloads"],
            }
        ],
    }
    monkeypatch.setattr(bd, "discover_installed_browsers", lambda: fake_discovery)

    tabs_res = bd.read_browser_context("tabs", browser="default", limit=20)
    assert tabs_res["count"] == 1
    assert tabs_res["workspaces"][0]["name"] == "Ders Çalışma"
    assert tabs_res["items"][0]["title"] == "Python Docs"
    assert tabs_res["items"][0]["workspace"] == "Ders Çalışma"
    # Sensitive query params must be redacted & cookies/passwords must never leak
    raw_dump = json.dumps(tabs_res, ensure_ascii=False)
    assert "xyz999" not in raw_dump
    assert "MUST_NEVER_BE_RETURNED" not in raw_dump
    assert "TOP_SECRET_PASSWORD" not in raw_dump

    bm_res = bd.read_browser_context("bookmarks", browser="zen", query="Makale")
    assert bm_res["count"] == 1
    assert bm_res["items"][0]["folder"] == "Araştırma"
    assert "secret123" not in json.dumps(bm_res)


def test_real_host_browser_discovery_smoke():
    info = bd.discover_installed_browsers()
    assert "default_browser" in info
    assert isinstance(info["browsers"], list)
    assert info["count"] >= 1


def test_pdf_academic_creation_live_edit_and_forms(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes_home"))

    pdf_out = tmp_path / "odev_raporu.pdf"
    created = ds.create_rich_document_data(
        output_path=str(pdf_out),
        title="Üniversite Araştırma Raporu",
        author="Elif Yılmaz",
        subtitle="Bilgisayar Mühendisliği",
        style="academic",
        content_markdown="# Giriş\nTürkçe karakter doğrulaması: ğ ü ş ı ö ç Ğ Ü Ş İ Ö Ç.\n\n| Model | Skor |\n|---|---|\n| Baseline | 88 |\n",
    )
    assert created["pages"] >= 1
    assert pdf_out.is_file()
    assert len(created["preview_images"]) == 1
    assert Path(created["preview_images"][0]).stat().st_size > 1000

    text, method = ds.extract_pdf_rich(pdf_out)
    assert method == "pymupdf+pdfplumber"
    assert "ğ ü ş ı ö ç Ğ Ü Ş İ Ö Ç" in text

    edited = ds.pdf_edit_live_data(
        pdf_path=str(pdf_out),
        operations=[
            {"op": "replace_text", "find": "Baseline", "replace": "Foolmoon-TR"},
            {"op": "insert_text", "page": 1, "x": 48, "y": 460, "text": "Canlı Not: İçerik incelendi."},
            {"op": "render_preview", "pages": [1]},
        ],
    )
    assert edited["operations_applied"] == 3
    assert len(edited["preview_images"]) == 1
    edited_text, _ = ds.extract_pdf_rich(pdf_out)
    assert "Foolmoon-TR" in edited_text
    assert "İçerik incelendi" in edited_text

    # AcroForm inspect + Turkish fill + flatten
    form_pdf = tmp_path / "staj_formu.pdf"
    doc = pymupdf.open()
    pg = doc.new_page()
    pg.insert_text((60, 72), "Öğrenci Adı:", fontsize=11)
    widget = pymupdf.Widget()
    widget.field_name = "student_name"
    widget.field_label = "Öğrenci Adı"
    widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
    widget.rect = pymupdf.Rect(160, 56, 390, 78)
    pg.add_widget(widget)
    doc.save(str(form_pdf))
    doc.close()

    inspected = ds.pdf_inspect_form_data(str(form_pdf))
    assert inspected["has_interactive_form"] is True
    assert inspected["interactive_field_count"] == 1
    assert len(inspected["flat_field_candidates"]) >= 1

    filled = ds.pdf_fill_form_data(
        pdf_path=str(form_pdf),
        values={"Öğrenci Adı": "Şükran Öztürk"},
        flatten=True,
        render_preview=False,
    )
    assert filled["filled_count"] == 1
    assert not filled["unmatched_keys"]
    filled_text, _ = ds.extract_pdf_rich(Path(filled["output_path"]))
    assert "Şükran Öztürk" in filled_text

    # DOCX + XLSX generation & extraction round-trip
    docx_out = tmp_path / "notlar.docx"
    xlsx_out = tmp_path / "liste.xlsx"
    ds.create_rich_document_data(str(docx_out), "Ders Özeti", "Türkçe not: ğüşıöç", author="Öğrenci")
    ds.create_rich_document_data(str(xlsx_out), "Plan", "| Ders | Kredi |\n|---|---|\n| Algoritmalar | 4 |")
    assert "ğüşıöç" in ds.extract_docx_rich(docx_out)
    assert "Algoritmalar" in ds.extract_xlsx_rich(xlsx_out)


def test_universal_lists_and_site_agnostic_price_tracking(tmp_path):
    db = str(tmp_path / "assistant_wb.db")
    html_v1 = """
    <html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"Mekanik Klavye TKL","offers":{"price":"3.499,50","priceCurrency":"TRY","availability":"https://schema.org/InStock"}}
      </script>
    </head><body></body></html>
    """
    html_v2 = """
    <html><head>
      <meta property="og:title" content="Mekanik Klavye TKL" />
      <meta property="product:price:amount" content="2.899,00" />
      <meta property="product:price:currency" content="TRY" />
    </head><body></body></html>
    """

    tracked = wb.track_web_item_data(
        url="https://shop.invalid/klavye",
        list_name="İstek Listem",
        target_price=3000.0,
        html_snapshot=html_v1,
        db_path=db,
    )
    assert tracked["price"] == 3499.5
    assert tracked["currency"] == "TRY"
    assert tracked["alert_triggered"] is False

    checked = wb.check_tracked_items_data(
        list_name="İstek Listem",
        html_overrides={"https://shop.invalid/klavye": html_v2},
        db_path=db,
    )
    assert checked["alerts_triggered"] == 1
    assert checked["items"][0]["current_price"] == 2899.0
    assert checked["items"][0]["price_delta"] == -600.5

    exported = wb.list_manage_data("export", list_name="İstek Listem", export_format="csv", db_path=db)
    assert "Mekanik Klavye TKL" in exported["content"]


def test_codebase_analyzer_and_symbol_search(tmp_path):
    (tmp_path / "package.json").write_text('{"name":"demo"}', encoding="utf-8")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "engine.py").write_text(
        "# TODO: optimize loop\ndef compute_score(items):\n    return len(items)\n",
        encoding="utf-8",
    )
    (tmp_path / "src" / "test_engine.py").write_text(
        "from engine import compute_score\ndef test_ok():\n    assert compute_score([1]) == 1\n",
        encoding="utf-8",
    )

    summary = wb.analyze_codebase_data(str(tmp_path))
    assert summary["files_scanned"] == 3
    assert "package.json" in summary["manifests"]
    assert summary["total_todo_markers"] == 1
    assert summary["source_files"] == 1
    assert summary["test_files"] == 1

    syms = wb.search_code_symbols_data(str(tmp_path), "compute_score")
    assert syms["definition_count"] == 1
    assert syms["reference_count"] >= 1
