import re
import html
from pathlib import Path

raw = Path("1.html").read_text(encoding="utf-8")
parts = re.findall(r'<td class="line-content">(.*?)</td>', raw, re.DOTALL)
lines = []
for p in parts:
    text = re.sub(r"<[^>]+>", "", p)
    text = html.unescape(text)
    lines.append(text)

actual = "\n".join(lines)
Path("page.html").write_text(actual, encoding="utf-8")
print(f"Extracted {len(actual)} chars, {len(lines)} lines")
print("First 200 chars:", repr(actual[:200]))
