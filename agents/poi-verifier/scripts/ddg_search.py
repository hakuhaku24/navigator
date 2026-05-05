"""
Usage: python ddg_search.py <query>
Returns JSON array of blog results to stdout.
"""
import sys
import json
sys.stdout.reconfigure(encoding='utf-8')
from ddgs import DDGS


def search(query: str, max_results: int = 5) -> list:
    try:
        results = DDGS().text(query, region="tw-tzh", max_results=max_results)
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
                "published_date": None,
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
