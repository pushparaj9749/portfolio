# Tiny static server for previewing a no-build static app.
#   * correct MIME types (a module Worker needs text/javascript)
#   * HTTP byte ranges
#   * no caching, so you always see your edits
# Usage: python3 serve.py [port] [dir]
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else ".")
PORT = int(sys.argv[1] if len(sys.argv) > 1 else 3000)

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "BenchPreview/1.0"

    def _path(self):
        rel = unquote(self.path.split("?")[0].split("#")[0]).lstrip("/") or "index.html"
        full = os.path.normpath(os.path.join(ROOT, rel))
        if not full.startswith(ROOT):
            return None
        if os.path.isdir(full):
            full = os.path.join(full, "index.html")
        return full if os.path.isfile(full) else None

    def do_GET(self):
        full = self._path()
        if not full:
            body = b"404 not found"
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        size = os.path.getsize(full)
        ext = os.path.splitext(full)[1].lower()
        ctype = TYPES.get(ext, "application/octet-stream")
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        partial = False
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                partial = True
                if m.group(1):
                    start = int(m.group(1))
                    if m.group(2):
                        end = min(int(m.group(2)), size - 1)
                elif m.group(2):
                    start = max(size - int(m.group(2)), 0)
        length = end - start + 1

        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with open(full, "rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(65536, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except BrokenPipeError:
                    break
                remaining -= len(chunk)

    do_HEAD = do_GET

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    print(f"serving {ROOT} on http://0.0.0.0:{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
