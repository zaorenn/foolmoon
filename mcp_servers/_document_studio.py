"""Live PDF editing, form inspection/filling, rich document extraction, and publication generation.

Built on ``pymupdf``, ``pdfplumber``, ``python-docx``, and ``openpyxl`` with full
Turkish/Unicode TrueType font support (``ğüşıöçĞÜŞİÖÇ``) across Windows, macOS, and Linux.
"""
from __future__ import annotations

import html
import io
import json
import os
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

import pymupdf

from mcp_servers._common import expand_path, get_hermes_home_path

try:
    import pdfplumber
except Exception:  # pragma: no cover
    pdfplumber = None  # type: ignore[assignment]


_TURKISH_SANS_CANDIDATES = (
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\calibri.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
)

_TURKISH_SERIF_CANDIDATES = (
    r"C:\Windows\Fonts\georgia.ttf",
    r"C:\Windows\Fonts\times.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
)

_TURKISH_MONO_CANDIDATES = (
    r"C:\Windows\Fonts\consola.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
)


def find_unicode_font(family: str = "sans") -> Path | None:
    """Locate an installed TrueType font with full Turkish/Latin-Extended coverage."""
    pools = {
        "serif": _TURKISH_SERIF_CANDIDATES + _TURKISH_SANS_CANDIDATES,
        "mono": _TURKISH_MONO_CANDIDATES + _TURKISH_SANS_CANDIDATES,
        "sans": _TURKISH_SANS_CANDIDATES + _TURKISH_SERIF_CANDIDATES,
    }
    for cand in pools.get(family, _TURKISH_SANS_CANDIDATES):
        p = Path(cand)
        if p.is_file():
            return p
    return None


def _parse_hex_color(raw: str | tuple[float, float, float] | None, default: tuple[float, float, float] = (0.08, 0.09, 0.12)) -> tuple[float, float, float]:
    if isinstance(raw, (tuple, list)) and len(raw) == 3:
        return tuple(max(0.0, min(1.0, float(c))) for c in raw)  # type: ignore[return-value]
    s = str(raw or "").strip().lstrip("#")
    if len(s) == 6:
        try:
            return (int(s[0:2], 16) / 255.0, int(s[2:4], 16) / 255.0, int(s[4:6], 16) / 255.0)
        except ValueError:
            pass
    return default


def _preview_output_dir() -> Path:
    d = get_hermes_home_path() / "pdf_previews"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _render_pdf_previews(doc: pymupdf.Document, pages: list[int] | None = None, dpi: int = 135, stem: str = "pdf") -> list[str]:
    out_dir = _preview_output_dir()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    total = len(doc)
    selected = [p for p in (pages or [1]) if 1 <= int(p) <= total]
    if not selected and total > 0:
        selected = [1]
    scale = max(72, min(250, int(dpi))) / 72.0
    mat = pymupdf.Matrix(scale, scale)
    rendered: list[str] = []
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem)[:40] or "pdf"
    for pno in selected[:6]:
        pix = doc[pno - 1].get_pixmap(matrix=mat, alpha=False)
        out_path = out_dir / f"{safe_stem}_p{pno}_{stamp}.png"
        pix.save(str(out_path))
        rendered.append(str(out_path))
    return rendered


def _atomic_save_pdf(doc: pymupdf.Document, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".fm_pdf_", suffix=".pdf", dir=str(target_path.parent))
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        doc.save(str(tmp_path), garbage=3, deflate=True)
        doc.close()
        os.replace(tmp_path, target_path)
    except Exception:
        try:
            doc.close()
        except Exception:
            pass
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise


def extract_pdf_rich(path: Path) -> tuple[str, str]:
    """Extract UTF-8 text, metadata, form summary, and optional tables from PDF via PyMuPDF + pdfplumber."""
    doc = pymupdf.open(str(path))
    try:
        meta = doc.metadata or {}
        parts: list[str] = []
        meta_items = [f"{k}: {v}" for k, v in meta.items() if v]
        parts.append(f"[PDF Pages: {len(doc)}]" + (f" | {' | '.join(meta_items[:5])}" if meta_items else ""))
        widget_count = 0
        for idx, page in enumerate(doc, start=1):
            w_list = list(page.widgets() or [])
            widget_count += len(w_list)
            txt = (page.get_text("text") or "").replace("\xa0", " ").replace("\xad", "-").replace("\u2010", "-").strip()
            parts.append(f"\n--- Page {idx} ---\n{txt}")
        if widget_count:
            parts.insert(1, f"[Interactive Form Fields Detected: {widget_count}]")
        combined = "\n".join(parts).strip()
    finally:
        doc.close()

    # Best-effort table summary from first few pages via pdfplumber if text has tables
    if pdfplumber is not None:
        try:
            with pdfplumber.open(str(path)) as plumber:
                table_notes: list[str] = []
                for idx, page in enumerate(plumber.pages[:6], start=1):
                    tables = page.extract_tables() or []
                    for t_idx, tbl in enumerate(tables[:3], start=1):
                        rows_fmt = [" | ".join(str(cell or "").replace("\n", " ").strip() for cell in row) for row in tbl[:12]]
                        if rows_fmt:
                            table_notes.append(f"[Table p{idx}.{t_idx}]\n" + "\n".join(rows_fmt))
                if table_notes:
                    combined += "\n\n=== Extracted Tables ===\n" + "\n\n".join(table_notes)
        except Exception:
            pass

    return combined, "pymupdf+pdfplumber"


def extract_docx_rich(path: Path) -> str:
    """Extract headings, paragraphs, and tables from DOCX via python-docx."""
    import docx as _docx

    document = _docx.Document(str(path))
    lines: list[str] = []
    for p in document.paragraphs:
        txt = p.text.strip()
        if not txt:
            continue
        style = (p.style.name if p.style else "") or ""
        if style.startswith("Heading"):
            lines.append(f"## {txt}")
        else:
            lines.append(txt)
    for t_idx, tbl in enumerate(document.tables[:10], start=1):
        lines.append(f"\n[Table {t_idx}]")
        for row in tbl.rows[:30]:
            cells = [c.text.replace("\n", " ").strip() for c in row.cells]
            if any(cells):
                lines.append(" | ".join(cells))
    return "\n".join(lines)


def extract_xlsx_rich(path: Path) -> str:
    """Extract worksheet values from XLSX via openpyxl."""
    import openpyxl

    wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
    try:
        out: list[str] = []
        for sheet_name in wb.sheetnames[:8]:
            ws = wb[sheet_name]
            out.append(f"=== {sheet_name} ===")
            row_count = 0
            for row in ws.iter_rows(values_only=True):
                vals = [str(v) if v is not None else "" for v in row]
                if any(vals):
                    out.append(" | ".join(vals))
                    row_count += 1
                if row_count >= 120:
                    out.append("...[sheet rows truncated]")
                    break
        return "\n".join(out)
    finally:
        wb.close()


def pdf_inspect_form_data(path: str) -> dict[str, Any]:
    """Inspect interactive AcroForm fields AND flat label/blank-line candidates with coordinates."""
    fp = expand_path(path)
    if not fp.is_file():
        raise FileNotFoundError(f"PDF not found: {fp}")
    doc = pymupdf.open(str(fp))
    try:
        widgets_out: list[dict[str, Any]] = []
        flat_candidates: list[dict[str, Any]] = []
        for p_idx, page in enumerate(doc, start=1):
            for w in page.widgets() or []:
                rect = [round(float(v), 1) for v in (w.rect.x0, w.rect.y0, w.rect.x1, w.rect.y1)]
                widgets_out.append(
                    {
                        "page": p_idx,
                        "field_name": str(w.field_name or ""),
                        "field_label": str(w.field_label or ""),
                        "field_type": str(w.field_type_string or ""),
                        "value": w.field_value,
                        "choices": list(w.choice_values or []) if hasattr(w, "choice_values") else [],
                        "rect": rect,
                    }
                )

            # Detect flat form fields (`Label: ______` or `Label:` lines) for non-AcroForm PDFs
            tdict = page.get_text("dict") or {}
            page_w = float(page.rect.width)
            for block in tdict.get("blocks", []):
                for line in block.get("lines", []):
                    spans = line.get("spans", [])
                    text = "".join(str(sp.get("text") or "") for sp in spans).strip()
                    if not text or len(text) > 90:
                        continue
                    bbox = line.get("bbox") or [0, 0, 0, 0]
                    is_label = (
                        ":" in text and len(text.split(":", 1)[0].strip()) >= 2
                    ) or "___" in text or "…" in text or "[ ]" in text or "☐" in text
                    if is_label:
                        x0, y0, x1, y1 = [round(float(c), 1) for c in bbox]
                        suggest_x = min(page_w - 80.0, x1 + 8.0) if "___" not in text else round(x0 + (x1 - x0) * 0.45, 1)
                        flat_candidates.append(
                            {
                                "page": p_idx,
                                "text": text,
                                "label_rect": [x0, y0, x1, y1],
                                "suggested_insert": {"x": round(suggest_x, 1), "y": round(y1 - 2.0, 1)},
                            }
                        )

        return {
            "path": str(fp),
            "pages": len(doc),
            "has_interactive_form": len(widgets_out) > 0,
            "interactive_field_count": len(widgets_out),
            "fields": widgets_out,
            "flat_field_candidates": flat_candidates[:80],
        }
    finally:
        doc.close()


def _normalize_key(s: str) -> str:
    return re.sub(r"[^a-z0-9ğüşıöç]+", "", (s or "").lower())


def pdf_fill_form_data(
    pdf_path: str,
    values: dict[str, Any] | str = "",
    output_path: str = "",
    flatten: bool = False,
    overlays: list[dict[str, Any]] | str | None = None,
    render_preview: bool = True,
) -> dict[str, Any]:
    """Fill AcroForm fields and/or flat coordinate overlays with Turkish-safe Unicode typography."""
    src = expand_path(pdf_path)
    if not src.is_file():
        raise FileNotFoundError(f"PDF not found: {src}")

    val_map: dict[str, Any] = {}
    if isinstance(values, str) and values.strip():
        val_map = json.loads(values)
    elif isinstance(values, dict):
        val_map = values

    overlay_list: list[dict[str, Any]] = []
    if isinstance(overlays, str) and overlays.strip():
        overlay_list = json.loads(overlays)
    elif isinstance(overlays, list):
        overlay_list = overlays

    out = expand_path(output_path) if output_path.strip() else src.with_name(f"{src.stem}_filled.pdf")

    doc = pymupdf.open(str(src))
    sans_font = find_unicode_font("sans")
    norm_values = {_normalize_key(str(k)): (k, v) for k, v in val_map.items()}
    matched_input_keys: set[str] = set()
    filled_fields: list[dict[str, Any]] = []

    try:
        for p_idx, page in enumerate(doc, start=1):
            font_name = "helv"
            if sans_font is not None:
                try:
                    page.insert_font(fontname="fm_sans", fontfile=str(sans_font))
                    font_name = "fm_sans"
                except Exception:
                    font_name = "helv"

            for w in list(page.widgets() or []):
                fname = str(w.field_name or "")
                flabel = str(w.field_label or "")
                chosen_key = None
                chosen_val: Any = None
                if fname in val_map:
                    chosen_key, chosen_val = fname, val_map[fname]
                elif flabel and flabel in val_map:
                    chosen_key, chosen_val = flabel, val_map[flabel]
                else:
                    nf = _normalize_key(fname)
                    nl = _normalize_key(flabel)
                    if nf in norm_values:
                        chosen_key, chosen_val = norm_values[nf]
                    elif nl and nl in norm_values:
                        chosen_key, chosen_val = norm_values[nl]

                if chosen_key is None:
                    continue

                matched_input_keys.add(chosen_key)
                ftype = str(w.field_type_string or "").lower()
                if "check" in ftype:
                    truthy = (
                        chosen_val
                        if isinstance(chosen_val, bool)
                        else str(chosen_val).strip().lower() in ("true", "1", "yes", "on", "evet", "x")
                    )
                    w.field_value = truthy
                else:
                    w.field_value = str(chosen_val)
                w.update()
                filled_fields.append({"page": p_idx, "field_name": fname, "value": chosen_val})

            # Apply flat-PDF coordinate overlays targeted at this page
            for ov in overlay_list:
                if int(ov.get("page", 1)) != p_idx:
                    continue
                x = float(ov.get("x", 72))
                y = float(ov.get("y", 72))
                txt = str(ov.get("text", ""))
                fsize = float(ov.get("font_size", 10.5))
                col = _parse_hex_color(ov.get("color"))
                fkw_ov = {"fontname": font_name, "fontfile": str(sans_font)} if (sans_font is not None and font_name != "helv") else {"fontname": "helv"}
                page.insert_text(pymupdf.Point(x, y), txt, fontsize=fsize, color=col, **fkw_ov)
                filled_fields.append({"page": p_idx, "overlay_at": [x, y], "text": txt})

        if flatten:
            # Render clean appearance onto content streams across pages
            for page in doc:
                for w in list(page.widgets() or []):
                    rect = w.rect
                    val = w.field_value
                    ftype = str(w.field_type_string or "").lower()
                    page.delete_widget(w)
                    fkw_flat = {"fontname": "fm_sans_flat", "fontfile": str(sans_font)} if sans_font is not None else {"fontname": "helv"}
                    if "check" in ftype:
                        if val in (True, "Yes", "On", "true", "1"):
                            page.insert_text(
                                pymupdf.Point(rect.x0 + 2, rect.y1 - 3),
                                "X",
                                fontsize=max(9.0, rect.height * 0.75),
                                color=(0.08, 0.09, 0.12),
                                **fkw_flat,
                            )
                    elif val is not None and str(val) != "":
                        page.insert_text(
                            pymupdf.Point(rect.x0 + 3, rect.y1 - max(3.5, rect.height * 0.25)),
                            str(val),
                            fontsize=max(8.5, min(12.0, rect.height * 0.65)),
                            color=(0.08, 0.09, 0.12),
                            **fkw_flat,
                        )

        previews = _render_pdf_previews(doc, [1], stem=out.stem) if render_preview else []
        unmatched = [k for k in val_map if k not in matched_input_keys]
        _atomic_save_pdf(doc, out)
        return {
            "output_path": str(out),
            "flattened": bool(flatten),
            "filled_count": len(filled_fields),
            "filled": filled_fields,
            "unmatched_keys": unmatched,
            "preview_images": previews,
        }
    except Exception:
        try:
            doc.close()
        except Exception:
            pass
        raise


def pdf_edit_live_data(
    pdf_path: str,
    operations: list[dict[str, Any]] | str,
    output_path: str = "",
) -> dict[str, Any]:
    """Perform live structured edits on an existing PDF: replace_text, insert_text, highlight, note, insert_image, delete_pages, reorder_pages, merge_pdfs, set_metadata, render_preview."""
    src = expand_path(pdf_path)
    if not src.is_file():
        raise FileNotFoundError(f"PDF not found: {src}")

    ops: list[dict[str, Any]] = json.loads(operations) if isinstance(operations, str) else list(operations)
    if not isinstance(ops, list) or not ops:
        raise ValueError("operations must be a non-empty list.")

    out = expand_path(output_path) if output_path.strip() else src
    doc = pymupdf.open(str(src))
    sans_font = find_unicode_font("sans")
    results: list[dict[str, Any]] = []
    previews: list[str] = []

    def _font_kwargs(page: pymupdf.Page, family: str = "sans") -> dict[str, Any]:
        fp_font = find_unicode_font(family) or sans_font
        if fp_font is None:
            return {"fontname": "helv"}
        tag = f"fm_{family}"
        try:
            page.insert_font(fontname=tag, fontfile=str(fp_font))
            return {"fontname": tag, "fontfile": str(fp_font)}
        except Exception:
            return {"fontname": "helv"}

    try:
        for step in ops:
            op = str(step.get("op") or "").strip().lower()
            if op == "replace_text":
                find_str = str(step.get("find") or "")
                replace_str = str(step.get("replace") or "")
                if not find_str:
                    raise ValueError("replace_text requires non-empty 'find'.")
                target_pages = step.get("pages") or list(range(1, len(doc) + 1))
                fsize_override = step.get("font_size")
                col = _parse_hex_color(step.get("color"))
                hits = 0
                for pno in target_pages:
                    if not (1 <= int(pno) <= len(doc)):
                        continue
                    page = doc[int(pno) - 1]
                    rects = page.search_for(find_str)
                    if not rects:
                        continue
                    replacements: list[tuple[pymupdf.Rect, float]] = []
                    for r in rects:
                        est_size = float(fsize_override) if fsize_override else max(8.0, min(18.0, r.height * 0.78))
                        page.add_redact_annot(r, fill=(1, 1, 1))
                        replacements.append((r, est_size))
                    page.apply_redactions()
                    fkw = _font_kwargs(page, str(step.get("font_family", "sans")))
                    for r, est_size in replacements:
                        page.insert_text(
                            pymupdf.Point(r.x0, r.y1 - max(1.5, r.height * 0.16)),
                            replace_str,
                            fontsize=est_size,
                            color=col,
                            **fkw,
                        )
                        hits += 1
                results.append({"op": op, "find": find_str, "replace": replace_str, "matches_replaced": hits})

            elif op == "insert_text":
                pno = int(step.get("page", 1))
                if not (1 <= pno <= len(doc)):
                    raise ValueError(f"Page {pno} out of range (1..{len(doc)})")
                page = doc[pno - 1]
                fkw = _font_kwargs(page, str(step.get("font_family", "sans")))
                x = float(step.get("x", 72))
                y = float(step.get("y", 72))
                fsize = float(step.get("font_size", 11.0))
                col = _parse_hex_color(step.get("color"))
                page.insert_text(pymupdf.Point(x, y), str(step.get("text", "")), fontsize=fsize, color=col, **fkw)
                results.append({"op": op, "page": pno, "at": [x, y]})

            elif op in ("highlight", "note"):
                pno = int(step.get("page", 1))
                if not (1 <= pno <= len(doc)):
                    raise ValueError(f"Page {pno} out of range (1..{len(doc)})")
                page = doc[pno - 1]
                targets: list[pymupdf.Rect] = []
                if step.get("find"):
                    targets.extend(page.search_for(str(step["find"])))
                elif step.get("rect"):
                    r = step["rect"]
                    targets.append(pymupdf.Rect(float(r[0]), float(r[1]), float(r[2]), float(r[3])))
                for rect in targets:
                    if op == "highlight":
                        page.add_highlight_annot(rect)
                    else:
                        page.add_text_annot(pymupdf.Point(rect.x1 + 4, rect.y0), str(step.get("comment", "")))
                results.append({"op": op, "page": pno, "count": len(targets)})

            elif op == "insert_image":
                pno = int(step.get("page", 1))
                img_path = expand_path(str(step.get("image_path") or ""))
                if not img_path.is_file():
                    raise FileNotFoundError(f"Image not found: {img_path}")
                r = step.get("rect") or [72, 72, 240, 180]
                page = doc[pno - 1]
                page.insert_image(pymupdf.Rect(float(r[0]), float(r[1]), float(r[2]), float(r[3])), filename=str(img_path))
                results.append({"op": op, "page": pno, "image": str(img_path)})

            elif op == "delete_pages":
                drop = sorted({int(p) - 1 for p in (step.get("pages") or []) if 1 <= int(p) <= len(doc)}, reverse=True)
                for idx0 in drop:
                    doc.delete_page(idx0)
                results.append({"op": op, "deleted_count": len(drop), "remaining_pages": len(doc)})

            elif op == "reorder_pages":
                order = [int(p) - 1 for p in (step.get("order") or []) if 1 <= int(p) <= len(doc)]
                if not order:
                    raise ValueError("reorder_pages requires valid 1-based page numbers in 'order'.")
                doc.select(order)
                results.append({"op": op, "new_page_count": len(doc)})

            elif op == "merge_pdfs":
                appended = 0
                for raw_p in step.get("append_paths") or []:
                    ap = expand_path(str(raw_p))
                    if not ap.is_file():
                        raise FileNotFoundError(f"PDF to append not found: {ap}")
                    with pymupdf.open(str(ap)) as extra_doc:
                        doc.insert_pdf(extra_doc)
                        appended += len(extra_doc)
                results.append({"op": op, "appended_pages": appended, "total_pages": len(doc)})

            elif op == "set_metadata":
                cur = dict(doc.metadata or {})
                for key in ("title", "author", "subject", "keywords", "creator"):
                    if key in step and step[key] is not None:
                        cur[key] = str(step[key])
                doc.set_metadata(cur)
                results.append({"op": op, "metadata": {k: cur.get(k, "") for k in ("title", "author", "subject")}})

            elif op == "render_preview":
                pages = [int(p) for p in (step.get("pages") or [1])]
                dpi = int(step.get("dpi", 135))
                imgs = _render_pdf_previews(doc, pages=pages, dpi=dpi, stem=out.stem)
                previews.extend(imgs)
                results.append({"op": op, "images": imgs})

            else:
                raise ValueError(f"Unsupported pdf_edit_live operation '{op}'.")

        total_pages = len(doc)
        _atomic_save_pdf(doc, out)
        return {
            "output_path": str(out),
            "pages": total_pages,
            "operations_applied": len(results),
            "results": results,
            "preview_images": previews,
        }
    except Exception:
        try:
            doc.close()
        except Exception:
            pass
        raise


def _inline_md_to_html(text: str) -> str:
    escaped = html.escape(text, quote=False)
    # Inline code first (protect inner chars cleanly)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", escaped)
    return escaped


def _markdown_to_html_body(md_text: str) -> str:
    """Convert structured Markdown (headings, tables, lists, blockquotes, code blocks, paragraphs) into clean HTML."""
    lines = (md_text or "").replace("\r\n", "\n").split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue

        if stripped.startswith("```"):
            lang = html.escape(stripped[3:].strip())
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(html.escape(lines[i]))
                i += 1
            out.append(f'<pre data-lang="{lang}"><code>' + "\n".join(code_lines) + "</code></pre>")
            i += 1
            continue

        if stripped in ("---", "***", "___"):
            out.append("<hr/>")
            i += 1
            continue

        heading_m = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading_m:
            lvl = len(heading_m.group(1)) + 1  # H1 reserved for document title banner
            lvl = min(4, lvl)
            out.append(f"<h{lvl}>{_inline_md_to_html(heading_m.group(2).strip())}</h{lvl}>")
            i += 1
            continue

        # Markdown pipe table
        if "|" in stripped and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:\-|]+\|[\s:\-|]*$", lines[i + 1]):
            def _split_row(r: str) -> list[str]:
                row_s = r.strip().strip("|")
                return [c.strip() for c in row_s.split("|")]

            headers = _split_row(stripped)
            i += 2
            rows: list[list[str]] = []
            while i < len(lines) and "|" in lines[i].strip() and lines[i].strip():
                rows.append(_split_row(lines[i]))
                i += 1
            ths = "".join(f"<th>{_inline_md_to_html(h)}</th>" for h in headers)
            trs = "".join(
                "<tr>" + "".join(f"<td>{_inline_md_to_html(c)}</td>" for c in r) + "</tr>"
                for r in rows
            )
            out.append(f"<table><thead><tr>{ths}</tr></thead><tbody>{trs}</tbody></table>")
            continue

        if stripped.startswith(">"):
            quote_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(_inline_md_to_html(lines[i].strip().lstrip(">").strip()))
                i += 1
            out.append("<blockquote>" + "<br/>".join(quote_lines) + "</blockquote>")
            continue

        if re.match(r"^[-*]\s+", stripped):
            items: list[str] = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                items.append("<li>" + _inline_md_to_html(re.sub(r"^\s*[-*]\s+", "", lines[i]).strip()) + "</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\.\s+", lines[i]):
                items.append("<li>" + _inline_md_to_html(re.sub(r"^\s*\d+\.\s+", "", lines[i]).strip()) + "</li>")
                i += 1
            out.append("<ol>" + "".join(items) + "</ol>")
            continue

        para: list[str] = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (
                not nxt
                or nxt.startswith(("#", ">", "```", "---", "***"))
                or re.match(r"^([-*]|\d+\.)\s+", nxt)
                or ("|" in nxt and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:\-|]+\|", lines[i + 1]))
            ):
                break
            para.append(nxt)
            i += 1
        out.append("<p>" + _inline_md_to_html(" ".join(para)) + "</p>")

    return "\n".join(out)


def _create_rich_pdf(
    out_path: Path,
    title: str,
    content_markdown: str,
    style: str,
    author: str,
    subtitle: str,
    metadata: dict[str, Any] | None,
    render_preview: bool,
) -> dict[str, Any]:
    style_key = (style or "academic").strip().lower()
    sans = find_unicode_font("sans")
    serif = find_unicode_font("serif")
    body_font = serif if (style_key == "academic" and serif) else (sans or serif)

    archive = pymupdf.Archive()
    css_font_face = ""
    font_family_rule = "sans-serif"
    if body_font is not None:
        archive.add(body_font.read_bytes(), path=body_font.name)
        css_font_face += f"@font-face {{ font-family: 'FoolmoonBody'; src: url('{body_font.name}'); }}\n"
        font_family_rule = "'FoolmoonBody', sans-serif"
    if sans is not None and sans != body_font:
        archive.add(sans.read_bytes(), path=sans.name)
        css_font_face += f"@font-face {{ font-family: 'FoolmoonHeading'; src: url('{sans.name}'); }}\n"
        heading_font_rule = "'FoolmoonHeading', sans-serif"
    else:
        heading_font_rule = font_family_rule

    line_height = "1.55" if style_key == "academic" else "1.45"
    font_size = "10.6pt" if style_key == "academic" else "10.2pt"
    accent = "#1d3557" if style_key == "academic" else ("#7c2d12" if style_key == "report" else "#1f2937")
    text_align = "left"

    user_css = f"""
    {css_font_face}
    body {{
      font-family: {font_family_rule};
      font-size: {font_size};
      line-height: {line_height};
      color: #1a1d23;
      margin: 0;
    }}
    .doc-header {{
      border-bottom: 1.5pt solid {accent};
      padding-bottom: 8pt;
      margin-bottom: 14pt;
    }}
    h1 {{
      font-family: {heading_font_rule};
      font-size: 18pt;
      color: {accent};
      margin: 0 0 4pt 0;
      line-height: 1.22;
    }}
    .meta-line {{
      font-size: 9pt;
      color: #4b5563;
      margin: 2pt 0 0 0;
    }}
    h2 {{
      font-family: {heading_font_rule};
      font-size: 13pt;
      color: {accent};
      margin: 14pt 0 5pt 0;
      border-bottom: 0.5pt solid #d1d5db;
      padding-bottom: 2pt;
    }}
    h3, h4 {{
      font-family: {heading_font_rule};
      font-size: 11pt;
      color: #111827;
      margin: 10pt 0 4pt 0;
    }}
    p {{
      margin: 0 0 8pt 0;
      text-align: {text_align};
    }}
    ul, ol {{
      margin: 4pt 0 9pt 16pt;
    }}
    li {{
      margin-bottom: 3pt;
    }}
    blockquote {{
      border-left: 2.5pt solid {accent};
      background-color: #f8fafc;
      margin: 8pt 0;
      padding: 6pt 10pt;
      color: #374151;
    }}
    pre {{
      background-color: #f3f4f6;
      border: 0.5pt solid #e5e7eb;
      padding: 6pt 8pt;
      font-size: 8.8pt;
      margin: 6pt 0 10pt 0;
    }}
    code {{
      background-color: #f3f4f6;
      padding: 1pt 3pt;
      font-size: 9pt;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 8pt 0 12pt 0;
      font-size: 9.2pt;
    }}
    th {{
      background-color: {accent};
      color: #ffffff;
      text-align: left;
      padding: 5pt 6pt;
      border: 0.5pt solid {accent};
    }}
    td {{
      padding: 4.5pt 6pt;
      border: 0.5pt solid #d1d5db;
    }}
    hr {{
      border: none;
      border-top: 0.75pt solid #d1d5db;
      margin: 10pt 0;
    }}
    """

    meta_parts = []
    if author.strip():
        meta_parts.append(html.escape(author.strip()))
    if subtitle.strip():
        meta_parts.append(html.escape(subtitle.strip()))
    meta_parts.append(datetime.now().strftime("%Y-%m-%d"))
    header_html = (
        f'<div class="doc-header"><h1>{html.escape(title.strip() or "Document")}</h1>'
        f'<p class="meta-line">{" · ".join(meta_parts)}</p></div>'
    )
    body_html = _markdown_to_html_body(content_markdown)
    full_html = f"<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>{header_html}{body_html}</body></html>"

    story = pymupdf.Story(html=full_html, user_css=user_css, archive=archive)
    mediabox = pymupdf.paper_rect("a4")
    where = mediabox + (48, 52, -48, -52)  # generous clean margins

    def _rectfn(_rect_num: int, _filled: pymupdf.Rect):
        return mediabox, where, None

    buf = io.BytesIO()
    writer = pymupdf.DocumentWriter(buf)
    try:
        story.write(writer, _rectfn)
        writer.close()
    finally:
        writer = None  # release handle promptly

    # Post-pass: stamp subtle header/footer page numbers & PDF metadata cleanly
    doc = pymupdf.open("pdf", buf.getvalue())
    meta_dict = {
        "title": title.strip() or out_path.stem,
        "author": author.strip(),
        "subject": subtitle.strip(),
    }
    if isinstance(metadata, dict):
        for k in ("keywords", "creator"):
            if metadata.get(k):
                meta_dict[k] = str(metadata[k])
    doc.set_metadata(meta_dict)

    total = len(doc)
    footer_font = find_unicode_font("sans")
    for idx, page in enumerate(doc, start=1):
        fname = "helv"
        if footer_font is not None:
            try:
                page.insert_font(fontname="fm_footer", fontfile=str(footer_font))
                fname = "fm_footer"
            except Exception:
                pass
        page_w = float(page.rect.width)
        page_h = float(page.rect.height)
        footer_txt = f"{title.strip()[:60]}  —  {idx} / {total}" if title.strip() else f"{idx} / {total}"
        page.insert_text(
            pymupdf.Point(48, page_h - 26),
            footer_txt,
            fontsize=8.2,
            fontname=fname,
            color=(0.45, 0.48, 0.54),
        )
        if idx > 1 and title.strip():
            page.insert_text(
                pymupdf.Point(page_w - 48 - min(220.0, len(title) * 4.2), 28),
                title.strip()[:48],
                fontsize=7.8,
                fontname=fname,
                color=(0.55, 0.58, 0.62),
            )

    previews = _render_pdf_previews(doc, [1], stem=out_path.stem) if render_preview else []
    pages_count = len(doc)
    _atomic_save_pdf(doc, out_path)

    return {
        "output_path": str(out_path),
        "format": "pdf",
        "style": style_key,
        "pages": pages_count,
        "size_bytes": out_path.stat().st_size,
        "preview_images": previews,
    }


def _create_rich_docx(
    out_path: Path,
    title: str,
    content_markdown: str,
    author: str,
    subtitle: str,
) -> dict[str, Any]:
    import docx as _docx

    document = _docx.Document()
    if title.strip():
        document.core_properties.title = title.strip()
        document.add_heading(title.strip(), level=0)
    if subtitle.strip() or author.strip():
        meta_p = document.add_paragraph(" · ".join(p for p in (author.strip(), subtitle.strip()) if p))
        if meta_p.runs:
            meta_p.runs[0].italic = True

    lines = (content_markdown or "").replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if not s:
            i += 1
            continue
        hm = re.match(r"^(#{1,4})\s+(.+)$", s)
        if hm:
            document.add_heading(hm.group(2).strip(), level=min(4, len(hm.group(1))))
            i += 1
            continue
        if "|" in s and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:\-|]+\|[\s:\-|]*$", lines[i + 1]):
            headers = [c.strip() for c in s.strip("|").split("|")]
            i += 2
            rows: list[list[str]] = []
            while i < len(lines) and "|" in lines[i].strip() and lines[i].strip():
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            tbl = document.add_table(rows=1 + len(rows), cols=len(headers))
            tbl.style = "Table Grid"
            for col_i, h in enumerate(headers):
                tbl.rows[0].cells[col_i].text = h
            for r_i, row in enumerate(rows, start=1):
                for col_i in range(min(len(headers), len(row))):
                    tbl.rows[r_i].cells[col_i].text = row[col_i]
            continue
        if re.match(r"^[-*]\s+", s):
            document.add_paragraph(re.sub(r"^[-*]\s+", "", s), style="List Bullet")
            i += 1
            continue
        if re.match(r"^\d+\.\s+", s):
            document.add_paragraph(re.sub(r"^\d+\.\s+", "", s), style="List Number")
            i += 1
            continue
        document.add_paragraph(s)
        i += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    document.save(str(out_path))
    return {
        "output_path": str(out_path),
        "format": "docx",
        "paragraphs": len(document.paragraphs),
        "tables": len(document.tables),
        "size_bytes": out_path.stat().st_size,
    }


def _create_rich_xlsx(out_path: Path, title: str, content_markdown: str) -> dict[str, Any]:
    import openpyxl
    from openpyxl.styles import Font

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = re.sub(r"[\\/*?:\[\]]", "_", title.strip() or "Sheet1")[:31]

    lines = [ln.strip() for ln in (content_markdown or "").replace("\r\n", "\n").split("\n") if ln.strip()]
    wrote_rows = 0
    for ln in lines:
        if re.match(r"^\|?[\s:\-|]+\|[\s:\-|]*$", ln):
            continue
        if "|" in ln:
            cells = [c.strip() for c in ln.strip("|").split("|")]
            ws.append(cells)
            if wrote_rows == 0:
                for c in ws[ws.max_row]:
                    c.font = Font(bold=True)
            wrote_rows += 1
        elif ln:
            ws.append([ln])
            wrote_rows += 1

    for col in ws.columns:
        max_len = max((len(str(cell.value or "")) for cell in col), default=8)
        ws.column_dimensions[col[0].column_letter].width = min(60, max(12, max_len + 3))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(str(out_path))
    return {
        "output_path": str(out_path),
        "format": "xlsx",
        "rows": wrote_rows,
        "size_bytes": out_path.stat().st_size,
    }


def create_rich_document_data(
    output_path: str,
    title: str,
    content_markdown: str,
    style: str = "academic",
    author: str = "",
    subtitle: str = "",
    metadata: dict[str, Any] | str | None = None,
    render_preview: bool = True,
) -> dict[str, Any]:
    """Generate a publication-grade .pdf, .docx, .xlsx, or .md document with full Turkish Unicode support."""
    out = expand_path(output_path)
    ext = out.suffix.lower()
    meta_dict = json.loads(metadata) if isinstance(metadata, str) and metadata.strip() else (metadata if isinstance(metadata, dict) else None)

    if ext == ".pdf":
        return _create_rich_pdf(
            out_path=out,
            title=title,
            content_markdown=content_markdown,
            style=style,
            author=author,
            subtitle=subtitle,
            metadata=meta_dict,
            render_preview=render_preview,
        )
    if ext == ".docx":
        return _create_rich_docx(out, title, content_markdown, author, subtitle)
    if ext == ".xlsx":
        return _create_rich_xlsx(out, title, content_markdown)
    if ext in (".md", ".txt"):
        out.parent.mkdir(parents=True, exist_ok=True)
        header = f"# {title}\n\n" if title.strip() else ""
        out.write_text(header + content_markdown, encoding="utf-8")
        return {"output_path": str(out), "format": ext.lstrip("."), "size_bytes": out.stat().st_size}
    raise ValueError(f"Unsupported document extension '{ext}'. Use .pdf, .docx, .xlsx, .md, or .txt.")
