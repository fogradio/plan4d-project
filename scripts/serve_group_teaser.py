"""Serve only the standalone demo deliverables for local downloading."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from urllib.parse import urlsplit


OUTPUT = Path(__file__).resolve().parents[1] / "artifacts/group-publication-demo-20261015"
FILES = {
    "/plan4d-group-demo-1080p.mp4": "video/mp4",
    "/plan4d-group-demo-540p.mp4": "video/mp4",
    "/plan4d-group-demo-poster.jpg": "image/jpeg",
}


class DownloadHandler(BaseHTTPRequestHandler):
    def serve_file(self, include_body):
        route = urlsplit(self.path).path
        if route not in FILES:
            self.send_error(404)
            return
        path = OUTPUT / route.lstrip("/")
        if not path.is_file():
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", FILES[route])
        self.send_header("Content-Length", str(path.stat().st_size))
        self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if include_body:
            try:
                with path.open("rb") as stream:
                    shutil.copyfileobj(stream, self.wfile)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_GET(self):
        self.serve_file(True)

    def do_HEAD(self):
        self.serve_file(False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4324)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), DownloadHandler)
    print(f"Standalone downloads: http://127.0.0.1:{args.port}/plan4d-group-demo-540p.mp4", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
