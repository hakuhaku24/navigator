"""
Usage: python ddg_search.py <query>
Returns JSON array of blog results to stdout.
"""
import sys
import json
import re
sys.stdout.reconfigure(encoding='utf-8')
from ddgs import DDGS


DATE_PATTERNS = [
    (r'(202\d)[\/\-](\d{1,2})[\/\-](\d{1,2})', lambda m: f"{m[0]}-{m[1].zfill(2)}-{m[2].zfill(2)}"),
    (r'(202\d)年(\d{1,2})月(\d{1,2})日',         lambda m: f"{m[0]}-{m[1].zfill(2)}-{m[2].zfill(2)}"),
    (r'(202\d)年(\d{1,2})月',                     lambda m: f"{m[0]}-{m[1].zfill(2)}-01"),
    (r'(202\d)[\/\-](\d{1,2})',                   lambda m: f"{m[0]}-{m[1].zfill(2)}-01"),
]


def extract_date(title: str, snippet: str) -> str | None:
    text = f"{title} {snippet}"
    for pattern, formatter in DATE_PATTERNS:
        m = re.search(pattern, text)
        if m:
            return formatter(m.groups())
    return None


def search(query: str, max_results: int = 5) -> list:
    try:
        results = DDGS().text(query, region="tw-tzh", max_results=max_results)
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
                "published_date": extract_date(r.get("title", ""), r.get("body", "")),
                "source": "duckduckgo",
            }
            for r in results
        ]
    except Exception as e:
        print(f"[ddg_search] error: {e}", file=sys.stderr)
        return []


if __name__ == "__main__":
    query = " ".join(sys.argv[1:])
    if not query:
        print("[]")
        sys.exit(0)
    print(json.dumps(search(query), ensure_ascii=False))
