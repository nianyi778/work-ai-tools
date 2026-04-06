#!/usr/bin/env python3
import csv
import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

MAX_ROWS = 500
MAX_CHARS = 50000
NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def truncate_text(text: str) -> tuple[str, bool]:
    if len(text) <= MAX_CHARS:
        return text, False
    return f"{text[:MAX_CHARS]}\n... (truncated)", True


def emit_success(content: str, fmt: str, summary: str, truncated: bool = False) -> None:
    print(
        json.dumps(
            {
                "ok": True,
                "format": fmt,
                "summary": summary,
                "content": content,
                "truncated": truncated,
            }
        )
    )


def emit_error(message: str) -> None:
    print(json.dumps({"ok": False, "error": message}))


def parse_csv_file(path: Path) -> None:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))

    truncated = len(rows) > MAX_ROWS
    visible_rows = rows[:MAX_ROWS]
    lines = [", ".join(row) for row in visible_rows]
    if truncated:
        lines.append(f"... ({len(rows) - MAX_ROWS} more rows)")
    emit_success("\n".join(lines), "csv", f"CSV with {len(rows)} rows", truncated)


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    values: list[str] = []
    for item in root.findall("main:si", NS):
        values.append(
            "".join(node.text or "" for node in item.iterfind(".//main:t", NS))
        )
    return values


def sheet_targets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels
        if rel.attrib.get("Target")
    }

    result: list[tuple[str, str]] = []
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        rel_id = sheet.attrib.get(
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        )
        target = rel_map.get(rel_id)
        if target:
            result.append((sheet.attrib.get("name", "Sheet"), f"xl/{target}"))
    return result


def cell_value(cell: ElementTree.Element, strings: list[str]) -> str:
    value = cell.find("main:v", NS)
    if value is None or value.text is None:
        inline = cell.find("main:is/main:t", NS)
        return inline.text if inline is not None and inline.text else ""
    if cell.attrib.get("t") == "s":
        return strings[int(value.text)]
    return value.text


def parse_xlsx_file(path: Path) -> None:
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        sheets = sheet_targets(archive)
        lines: list[str] = []
        total_rows = 0
        truncated = False

        for sheet_name, target in sheets:
            root = ElementTree.fromstring(archive.read(target))
            rows = root.findall("main:sheetData/main:row", NS)
            total_rows += len(rows)
            lines.append(f"# {sheet_name}")
            for row in rows[:MAX_ROWS]:
                cells = [
                    cell_value(cell, strings) for cell in row.findall("main:c", NS)
                ]
                lines.append(" | ".join(cells))
            if len(rows) > MAX_ROWS:
                truncated = True
                lines.append(f"... ({len(rows) - MAX_ROWS} more rows)")
            lines.append("")

    content, text_truncated = truncate_text("\n".join(lines).strip())
    emit_success(
        content,
        "xlsx",
        f"Workbook with {len(sheets)} sheets and {total_rows} rows",
        truncated or text_truncated,
    )


def parse_xls_file(path: Path) -> None:
    try:
        import xlrd  # type: ignore
    except ImportError:
        emit_error("xlrd is required to parse .xls files")
        return

    workbook = xlrd.open_workbook(path)
    lines: list[str] = []
    total_rows = 0
    truncated = False
    for sheet in workbook.sheets():
        total_rows += sheet.nrows
        lines.append(f"# {sheet.name}")
        for index in range(min(sheet.nrows, MAX_ROWS)):
            lines.append(" | ".join(str(value) for value in sheet.row_values(index)))
        if sheet.nrows > MAX_ROWS:
            truncated = True
            lines.append(f"... ({sheet.nrows - MAX_ROWS} more rows)")
        lines.append("")

    content, text_truncated = truncate_text("\n".join(lines).strip())
    emit_success(
        content,
        "xls",
        f"Workbook with {workbook.nsheets} sheets and {total_rows} rows",
        truncated or text_truncated,
    )


def parse_pdf_file(path: Path) -> None:
    try:
        import pdfplumber  # type: ignore
    except ImportError:
        emit_error("pdfplumber is required to parse PDF files")
        return

    pages: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")

    content, truncated = truncate_text("\n\n".join(pages).strip())
    emit_success(content, "pdf", f"PDF with {len(pages)} pages", truncated)


def main() -> None:
    if len(sys.argv) != 2:
        emit_error("usage: parse_attachment.py <path>")
        raise SystemExit(1)

    path = Path(sys.argv[1])
    suffix = path.suffix.lower()
    if suffix == ".csv":
        parse_csv_file(path)
        return
    if suffix == ".xlsx":
        parse_xlsx_file(path)
        return
    if suffix == ".xls":
        parse_xls_file(path)
        return
    if suffix == ".pdf":
        parse_pdf_file(path)
        return
    if suffix == ".ods":
        emit_error("ODS parsing is not implemented yet")
        return

    emit_error(f"unsupported extension: {suffix}")


if __name__ == "__main__":
    main()
