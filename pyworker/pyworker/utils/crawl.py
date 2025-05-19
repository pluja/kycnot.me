import argparse
import os
import time
import requests
from dotenv import load_dotenv
from pyworker.utils.app_logging import setup_logging
from typing import Any

logger = setup_logging(__name__)


# Load environment variables from .env file
load_dotenv()

# Include API token header if set
CRAWL4AI_API_TOKEN = os.environ.get("CRAWL4AI_API_TOKEN", "")
HEADERS = (
    {"Authorization": f"Bearer {CRAWL4AI_API_TOKEN}"} if CRAWL4AI_API_TOKEN else {}
)

CRAWL4AI_BASE_URL = os.environ.get("CRAWL4AI_BASE_URL", "http://crawl4ai:11235")
CRAWL4AI_TIMEOUT = int(os.environ.get("CRAWL4AI_TIMEOUT", 300))
CRAWL4AI_POLL_INTERVAL = int(os.environ.get("CRAWL4AI_POLL_INTERVAL", 2))


def fetch_fallback(url: str) -> str:
    if not url:
        raise ValueError("URL must not be empty")
    logger.info(f"Fetching fallback for {url}")
    fallback_url = f"https://r.jina.ai/{url.lstrip('/')}"
    response = requests.get(fallback_url, timeout=80)
    response.raise_for_status()
    return response.text


def fetch_markdown(url: str, wait_for_dynamic_content: bool = True) -> str:
    if not CRAWL4AI_API_TOKEN:
        return fetch_fallback(url)

    try:
        payload: dict[str, Any] = {"urls": url}
        if wait_for_dynamic_content:
            # According to Crawl4AI docs, wait_for_images=True also waits for network idle state,
            # which is helpful for JS-generated content.
            # Adding scan_full_page and scroll_delay helps trigger lazy-loaded content.
            payload["config"] = {
                "wait_for_images": True,
                "scan_full_page": True,
                "scroll_delay": 0.5,
                "magic": True,
            }

        response = requests.post(
            f"{CRAWL4AI_BASE_URL}/crawl",
            json=payload,
            headers=HEADERS,
        )
        response.raise_for_status()
        task_id = response.json().get("task_id")
        start_time = time.time()
        while True:
            if time.time() - start_time > CRAWL4AI_TIMEOUT:
                raise TimeoutError(f"Task {task_id} timeout")
            status_resp = requests.get(
                f"{CRAWL4AI_BASE_URL}/task/{task_id}",
                headers=HEADERS,
            )
            status_resp.raise_for_status()
            status = status_resp.json()
            if status.get("status") == "completed":
                markdown = status["result"].get("markdown", "")
                metadata = status["result"].get("metadata", {})
                return f"""
URL: {url}
Page Metadata: `{metadata}`

Markdown Content
----------------
{markdown}
                """
            time.sleep(CRAWL4AI_POLL_INTERVAL)
    except (requests.exceptions.RequestException, TimeoutError):
        return fetch_fallback(url)


def main():
    parser = argparse.ArgumentParser(
        description="Crawl a URL and print its markdown content."
    )
    parser.add_argument("--url", required=True, help="The URL to crawl")

    args = parser.parse_args()
    print(f"Crawling {args.url}...")
    markdown_content = fetch_markdown(args.url)
    print("\n--- Markdown Content ---")
    print(markdown_content)


if __name__ == "__main__":
    main()
