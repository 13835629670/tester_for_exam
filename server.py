import base64
import json
import mimetypes
import os
import posixpath
import re
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

try:
    from PIL import Image
except Exception:
    Image = None

try:
    import fitz
except Exception:
    fitz = None


ROOT = Path(__file__).resolve().parent
PILLOW_WARNING = "Pillow 未安装，图片尺寸无法识别；大图可能无法自动从选项中分离。" if Image is None else ""
PDF_WARNING = "PyMuPDF 未安装，PDF 会尝试用本机 Word 转为 docx 后读取；建议安装：python -m pip install PyMuPDF" if fitz is None else ""


class UploadedFile:
    def __init__(self, filename, data):
        self.filename = filename
        self.data = data


class QuizHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urlparse(path)
        clean = posixpath.normpath(unquote(parsed.path)).lstrip("/")
        target = (ROOT / clean).resolve()
        if not is_path_relative_to(target, ROOT):
            return str(ROOT)
        return str(target)

    def do_POST(self):
        if self.path == "/api/extract-text":
            self.handle_extract_text()
            return
        self.send_error(404, "Not found")

    def handle_extract_text(self):
        fields, files = parse_multipart_form(self.headers, self.rfile)
        file_item = files.get("file")
        if file_item is None or not file_item.filename:
            self.write_json({"ok": False, "error": "未收到文件。"}, status=400)
            return

        original_name = fields.get("name") or file_item.filename
        suffix = Path(original_name).suffix.lower()
        with tempfile.TemporaryDirectory(prefix="quiz_import_") as temp_dir:
            source = Path(temp_dir) / f"upload{suffix}"
            source.write_bytes(file_item.data)

            try:
                text, method = extract_text(source)
                self.write_json(make_extract_response(text, method))
            except Exception as exc:
                self.write_json({"ok": False, "error": str(exc)}, status=500)

    def write_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def is_path_relative_to(path, parent):
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def parse_multipart_form(headers, stream):
    content_type = headers.get("Content-Type", "")
    boundary = parse_multipart_boundary(content_type)
    if not boundary:
        raise ValueError("请求不是有效的 multipart/form-data。")

    content_length = int(headers.get("Content-Length", "0") or "0")
    body = stream.read(content_length)
    delimiter = b"--" + boundary
    fields = {}
    files = {}

    for part in body.split(delimiter):
        part = part.strip(b"\r\n")
        if not part or part == b"--":
            continue
        if part.endswith(b"--"):
            part = part[:-2].rstrip(b"\r\n")
        if b"\r\n\r\n" not in part:
            continue

        raw_headers, data = part.split(b"\r\n\r\n", 1)
        data = data[:-2] if data.endswith(b"\r\n") else data
        part_headers = parse_part_headers(raw_headers)
        disposition = part_headers.get("content-disposition", "")
        if not disposition:
            continue
        _, params = parse_header_value(disposition)
        name = params.get("name", "")
        filename = params.get("filename")
        if not name:
            continue
        if filename is not None:
            files[name] = UploadedFile(filename, data)
        else:
            fields[name] = data.decode("utf-8", errors="replace")

    return fields, files


def parse_multipart_boundary(content_type):
    value, params = parse_header_value(content_type)
    if value.lower() != "multipart/form-data":
        return b""
    boundary = params.get("boundary", "")
    return boundary.encode("utf-8") if boundary else b""


def parse_part_headers(raw_headers):
    parsed = {}
    for line in raw_headers.decode("latin-1", errors="replace").split("\r\n"):
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        parsed[name.strip().lower()] = value.strip()
    return parsed


def parse_header_value(value):
    parts = [part.strip() for part in str(value or "").split(";")]
    main = parts[0] if parts else ""
    params = {}
    for item in parts[1:]:
        if "=" not in item:
            continue
        key, raw_value = item.split("=", 1)
        params[key.strip().lower()] = raw_value.strip().strip('"')
    return main, params


def make_extract_response(text, method):
    payload = {"ok": True, "text": text, "method": method}
    if PILLOW_WARNING:
        payload["warning"] = PILLOW_WARNING
    if method.startswith("pdf") and PDF_WARNING:
        payload["warning"] = " ".join([payload.get("warning", ""), PDF_WARNING]).strip()
    return payload


def extract_text(path):
    suffix = path.suffix.lower()
    if suffix not in {".docx", ".doc", ".pdf"}:
        raise ValueError("仅支持 docx、doc、pdf。")
    if suffix == ".docx":
        return extract_docx_text(path), "docx-xml-with-images"
    if suffix == ".doc":
        converted = path.with_suffix(".converted.docx")
        convert_with_word(path, converted, 16)
        return extract_docx_text(converted), "word-com-docx-with-images"
    if suffix == ".pdf":
        return extract_pdf_text(path)


def extract_pdf_text(path):
    if fitz is None:
        return extract_pdf_text_with_word(path), "pdf-word-docx-with-images"

    parts = []
    with fitz.open(path) as document:
        for page_index, page in enumerate(document, start=1):
            text = page.get_text("text", sort=True) or ""
            text = normalize_pdf_text(text)
            if text:
                parts.append(text)
            elif page_has_images(page):
                pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                parts.append(make_image_token(pixmap.tobytes("png"), "image/png"))

    result = "\n".join(part for part in parts if part).strip()
    if not result:
        raise RuntimeError("PDF 未提取到有效文本；如果是扫描版，需要先 OCR 或导出为缓存图片。")
    return result, "pdf-pymupdf-text"


def extract_pdf_text_with_word(path):
    converted = path.with_suffix(".pdf.converted.docx")
    try:
        convert_with_word(path, converted, 16)
        text = extract_docx_text(converted)
        if looks_like_garbled_text(text):
            raise RuntimeError("Word 转换后的 PDF 文本疑似乱码或图片化内容。")
        return text
    except Exception as exc:
        raise RuntimeError(
            "PDF 导入失败：未安装 PyMuPDF，且 Word 转换 PDF 也失败。"
            "请先执行 python -m pip install PyMuPDF，或手动将 PDF 另存为 docx 后导入。"
            f" 原因：{exc}"
        ) from exc


def looks_like_garbled_text(text):
    raw = str(text or "")
    sample = re.sub(r"\[\[(?:IMG|TABLE):[\s\S]*?\]\]", "[media]", raw)[:8000]
    if not sample.strip():
        return True
    cjk = sum(1 for char in sample if "\u4e00" <= char <= "\u9fff")
    ascii_text = sum(1 for char in sample if char.isascii() and (char.isalnum() or char in " .,;:!?()[]{}+-*/=_"))
    unusual = 0
    visible = 0
    for char in sample:
        if char.isspace():
            continue
        visible += 1
        code = ord(char)
        is_cjk = "\u4e00" <= char <= "\u9fff"
        is_common_fullwidth = 0x3000 <= code <= 0x303F or 0xFF00 <= code <= 0xFFEF
        if code > 127 and not is_cjk and not is_common_fullwidth:
            unusual += 1
    if "�" in sample or "锟" in sample:
        return True
    if visible < 100:
        return False
    non_ascii = sum(1 for char in sample if (not char.isspace()) and (not char.isascii()))
    cjk_ratio = cjk / visible
    non_ascii_ratio = non_ascii / visible
    if cjk_ratio < 0.05 and non_ascii_ratio > 0.45:
        return True
    return cjk < 80 and ascii_text < 400 and unusual / visible > 0.25


def normalize_pdf_text(text):
    raw_lines = []
    for line in str(text or "").replace("\r", "\n").splitlines():
        cleaned = " ".join(line.split())
        if cleaned:
            raw_lines.append(cleaned)

    lines = []
    index = 0
    while index < len(raw_lines):
        line = raw_lines[index]
        if (
            index + 1 < len(raw_lines)
            and raw_lines[index + 1] in {"）", ")"}
            and re.search(r"[（(]\s*[A-HＡ-Ｈ](?:\s*[,，、]?\s*[A-HＡ-Ｈ])*\s*$", line, re.I)
        ):
            line = f"{line} {raw_lines[index + 1]}"
            index += 1

        line = normalize_pdf_spaced_option_markers(line)
        line = normalize_pdf_embedded_question_starts(line)
        lines.extend(part for part in line.split("\n") if part.strip())
        index += 1
    return "\n".join(lines)


def normalize_pdf_spaced_option_markers(line):
    markers = re.findall(r"(^|\s)([A-HＡ-Ｈ])\s+(?=\S)", line)
    if len(markers) < 2:
        return line
    if re.match(r"^\s*[A-HＡ-Ｈ](?:\s+[A-HＡ-Ｈ]){2,}\s*$", line):
        return line
    if re.match(r"^\s*(?:[A-HＡ-Ｈ]\s+){2,}[A-HＡ-Ｈ](?:\s+[01x×]){2,}\s*$", line, re.I):
        return line
    return re.sub(r"(^|\s)([A-HＡ-Ｈ])\s+(?=\S)", lambda match: f"{match.group(1)}{match.group(2)}. ", line)


def normalize_pdf_embedded_question_starts(line):
    line = re.sub(
        r"(?<!^)(?<!\n)\s+(\d{1,3})\s+(?=\S.{0,80}?[（(]\s*(?:[A-HＡ-Ｈ]|正确|错误|对|错|√|×))",
        r"\n\1、",
        line,
    )
    return re.sub(
        r"^(\d{1,3})\s+(?=\S.{0,80}?[（(]\s*(?:[A-HＡ-Ｈ]|正确|错误|对|错|√|×))",
        r"\1、",
        line,
    )


def page_has_images(page):
    try:
        return bool(page.get_images(full=True))
    except Exception:
        return False


def extract_docx_text(path):
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
        relationships = read_docx_relationships(archive)
        image_cache = prepare_image_cache(archive, relationships)
        root = ET.fromstring(xml)
        text = render_docx_node(archive, relationships, image_cache, root)
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def read_docx_relationships(archive):
    relationships = {}
    try:
        rel_xml = archive.read("word/_rels/document.xml.rels")
    except KeyError:
        return relationships
    root = ET.fromstring(rel_xml)
    for item in root:
        rel_id = item.attrib.get("Id")
        target = item.attrib.get("Target")
        mode = item.attrib.get("TargetMode")
        if rel_id and target and mode != "External":
            relationships[rel_id] = posixpath.normpath(posixpath.join("word", target))
    return relationships


def render_docx_node(archive, relationships, image_cache, node):
    name = local_name(node.tag)
    if name == "tbl":
        return render_docx_table(archive, relationships, image_cache, node)
    if name in {"object", "drawing", "pict"}:
        tokens = image_tokens_from_node(archive, relationships, image_cache, node)
        if tokens:
            return " ".join(tokens)
    if name == "t":
        return node.text or ""
    if name == "tab":
        return "\t"
    if name in {"br", "cr"}:
        return "\n"

    content = "".join(render_docx_node(archive, relationships, image_cache, child) for child in node)
    if name == "p":
        return f"{content}\n"
    if name == "tc":
        return f"{content}\t"
    if name == "tr":
        return f"{content}\n"
    return content


def render_docx_table(archive, relationships, image_cache, table_node):
    rows = []
    for row_node in direct_children(table_node, "tr"):
        row = []
        for cell_node in direct_children(row_node, "tc"):
            cell_text = "".join(
                render_docx_node(archive, relationships, image_cache, child)
                for child in cell_node
                if local_name(child.tag) != "tcPr"
            )
            row.append(normalize_cell_text(cell_text))
        if any(cell for cell in row):
            rows.append(row)
    rows = expand_compact_table(rows)
    if not rows:
        return ""
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    token = base64.b64encode(payload).decode("ascii")
    return f"\n[[TABLE:{token}]]\n"


def direct_children(node, child_name):
    return [child for child in node if local_name(child.tag) == child_name]


def normalize_cell_text(value):
    lines = [" ".join(line.split()) for line in value.splitlines()]
    return "\n".join(line for line in lines if line).strip()


def expand_compact_table(rows):
    if not rows or any(len(row) != 1 for row in rows):
        return rows
    if any("[[IMG:" in row[0] or "[[TABLE:" in row[0] for row in rows):
        return rows

    expanded = []
    for row in rows:
        for line in row[0].splitlines():
            cells = line.split()
            if cells:
                expanded.append(cells)

    if len(expanded) < 2:
        return rows
    column_counts = [len(row) for row in expanded]
    if max(column_counts) <= 1:
        return rows
    return expanded


def image_tokens_from_node(archive, relationships, image_cache, node):
    tokens = []
    seen = set()
    for child in node.iter():
        rel_id = get_image_relationship_id(child)
        if not rel_id or rel_id in seen:
            continue
        seen.add(rel_id)
        token = image_token_from_relationship(archive, relationships, image_cache, rel_id)
        if token:
            tokens.append(token)
    return tokens


def get_image_relationship_id(node):
    for key, value in node.attrib.items():
        attr_name = local_name(key).lower()
        if attr_name in {"embed", "link", "id", "relid"} and value.startswith("rId"):
            return value
    return ""


def image_token_from_relationship(archive, relationships, image_cache, rel_id):
    target = relationships.get(rel_id)
    if not target:
        return ""
    if target in image_cache:
        return image_cache[target]
    return ""


def prepare_image_cache(archive, relationships):
    cache = {}
    metafiles = {}
    for target in set(relationships.values()):
        try:
            data = archive.read(target)
        except KeyError:
            continue
        mime = mimetypes.guess_type(target)[0] or ""
        ext = Path(target).suffix.lower()
        if ext in {".wmf", ".emf"} or mime in {"image/x-wmf", "image/x-emf", "image/emf"}:
            metafiles[target] = data
            continue
        if not mime.startswith("image/"):
            continue
        cache[target] = make_image_token(data, mime)

    cache.update(convert_metafiles_to_png(metafiles))
    return cache


def make_image_token(data, mime):
    encoded = base64.b64encode(data).decode("ascii")
    width, height = image_size(data)
    return f"[[IMG:{width}x{height}:data:{mime};base64,{encoded}]]"


def image_size(data):
    if Image is None:
        return 0, 0
    try:
        with Image.open(BytesIO(data)) as image:
            return image.size
    except Exception:
        return 0, 0


def convert_metafiles_to_png(metafiles):
    if not metafiles:
        return {}
    converted = {}
    with tempfile.TemporaryDirectory(prefix="quiz_formula_img_") as temp_dir:
        temp_path = Path(temp_dir)
        input_dir = temp_path / "in"
        output_dir = temp_path / "out"
        input_dir.mkdir()
        output_dir.mkdir()
        index = {}
        for number, (target, data) in enumerate(metafiles.items(), start=1):
            source = input_dir / f"img_{number}{Path(target).suffix.lower()}"
            source.write_bytes(data)
            index[source.stem] = target

        script = r"""
Add-Type -AssemblyName System.Drawing
$inputDir = $env:QUIZ_IMG_IN
$outputDir = $env:QUIZ_IMG_OUT
Get-ChildItem -LiteralPath $inputDir -File | ForEach-Object {
  $image = $null
  try {
    $image = [System.Drawing.Image]::FromFile($_.FullName)
    $target = Join-Path $outputDir ($_.BaseName + '.png')
    $image.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  } catch {
  } finally {
    if ($image) { $image.Dispose() }
  }
}
"""
        env = os.environ.copy()
        env["QUIZ_IMG_IN"] = str(input_dir)
        env["QUIZ_IMG_OUT"] = str(output_dir)
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=120
        )

        for file in output_dir.glob("*.png"):
            target = index.get(file.stem)
            if target:
                converted[target] = make_image_token(file.read_bytes(), "image/png")
    return converted


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def convert_with_word(source, target, file_format):
    script = word_conversion_script()
    env = os.environ.copy()
    env["QUIZ_INPUT"] = str(source)
    env["QUIZ_OUTPUT"] = str(target)
    env["QUIZ_FORMAT"] = str(file_format)
    completed = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=300
    )
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "Word 转换失败。"
        raise RuntimeError(message)
    if not target.exists():
        raise RuntimeError("Word 没有生成转换后的 docx。")


def word_conversion_script():
    script = r"""
$inputPath = $env:QUIZ_INPUT
$outputPath = $env:QUIZ_OUTPUT
$fileFormat = [int]$env:QUIZ_FORMAT
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($inputPath, $false, $true)
  $doc.SaveAs2($outputPath, $fileFormat)
  $doc.Close($false)
  $doc = $null
} finally {
  if ($doc) { try { $doc.Close($false) } catch {} }
  if ($word) { try { $word.Quit() } catch {} }
}
"""
    return script


def run():
    port = int(os.environ.get("PORT", "5175"))
    server = ThreadingHTTPServer(("127.0.0.1", port), QuizHandler)
    if PILLOW_WARNING:
        print(f"警告：{PILLOW_WARNING}")
    if PDF_WARNING:
        print(f"警告：{PDF_WARNING}")
    print(f"刷题工具已启动：http://127.0.0.1:{port}")
    print("支持 docx / doc / pdf 导入；doc 会调用本机 Word 转换。")
    server.serve_forever()


if __name__ == "__main__":
    run()
