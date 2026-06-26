import io
import re
import sys
import tempfile
import zipfile
from email.message import Message
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import server


def make_docx(path: Path) -> None:
    document_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>一、单选题</w:t></w:r></w:p>
    <w:p><w:r><w:t>1、题干（ ）</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. 甲 B. 乙 答案：A</w:t></w:r></w:p>
  </w:body>
</w:document>"""
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("word/document.xml", document_xml)


def multipart_headers(boundary: str, body: bytes) -> Message:
    headers = Message()
    headers["Content-Type"] = f'multipart/form-data; boundary="{boundary}"'
    headers["Content-Length"] = str(len(body))
    return headers


def test_multipart_parser(docx_bytes: bytes) -> None:
    boundary = "----quiz-smoke"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="name"\r\n\r\n'
        "sample.docx\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="sample.docx"\r\n'
        "Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n"
    ).encode("utf-8") + docx_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
    fields, files = server.parse_multipart_form(multipart_headers(boundary, body), io.BytesIO(body))
    assert fields["name"] == "sample.docx"
    assert files["file"].filename == "sample.docx"
    assert files["file"].data == docx_bytes


def test_path_containment() -> None:
    assert server.is_path_relative_to(server.ROOT / "index.html", server.ROOT)
    assert not server.is_path_relative_to(Path(str(server.ROOT) + "_sibling"), server.ROOT)
    assert Path(server.QuizHandler.translate_path(None, "/index.html")) == server.ROOT / "index.html"
    assert Path(server.QuizHandler.translate_path(None, "/../../../Windows/win.ini")).is_relative_to(server.ROOT)
    assert Path(server.QuizHandler.translate_path(None, "/..%2f..%2fWindows/win.ini")).is_relative_to(server.ROOT)


def assert_powershell_assignment(script: str, name: str, expected: str) -> None:
    pattern = rf"(?im)^\s*{re.escape(name)}\s*=\s*([^\r\n]+)\s*$"
    match = re.search(pattern, script)
    assert match, f"missing PowerShell assignment for {name}"
    assert match.group(1).strip().lower() == expected.lower()


def test_word_script_settings() -> None:
    script = server.word_conversion_script()
    assert_powershell_assignment(script, "$word.Visible", "$false")
    assert_powershell_assignment(script, "$word.DisplayAlerts", "0")


def test_pillow_warning_payload() -> None:
    old_warning = server.PILLOW_WARNING
    try:
        server.PILLOW_WARNING = "Pillow missing smoke"
        payload = server.make_extract_response("text", "method")
        assert payload["warning"] == "Pillow missing smoke"
    finally:
        server.PILLOW_WARNING = old_warning


def main() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        docx_path = Path(temp_dir) / "sample.docx"
        make_docx(docx_path)
        docx_bytes = docx_path.read_bytes()
        assert "题干" in server.extract_docx_text(docx_path)
        test_multipart_parser(docx_bytes)

    test_path_containment()
    test_word_script_settings()
    test_pillow_warning_payload()
    source = (PROJECT_ROOT / "server.py").read_text(encoding="utf-8")
    assert "import cgi" not in source
    assert "dir=ROOT" not in source
    print("server smoke ok")


if __name__ == "__main__":
    main()
