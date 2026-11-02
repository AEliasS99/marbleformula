#!/usr/bin/env python3
"""Complete the existing uploader's Google login from a second, private-network Mac.

The development Mac serves this with its Tailscale IP and public OAuth client ID
inserted. Passwords stay in Google; the callback travels privately to the existing
uploader listener. No token or callback URL is printed or saved by this helper.
"""
import http.server
import ipaddress
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

DEVELOPMENT_HOST = "__RACECRAFT_TAILSCALE_IP__"
CLIENT_ID = "__RACECRAFT_GOOGLE_CLIENT_ID__"


def main():
    host = ipaddress.ip_address(DEVELOPMENT_HOST)
    if host.version != 4 or host not in ipaddress.ip_network("100.64.0.0/10"):
        raise SystemExit("Use the helper downloaded from your connected development Mac.")
    if not CLIENT_ID.endswith(".apps.googleusercontent.com"):
        raise SystemExit("Missing Google client configuration.")
    state = secrets.token_urlsafe(32)
    done = threading.Event()
    auth = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "redirect_uri": "http://127.0.0.1:8899/oauth2callback",
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube",
        "access_type": "offline", "prompt": "consent", "state": state,
    })

    class Callback(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Callback paths contain credentials; never log them.

        def respond(self, status, body):
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))

        def do_GET(self):
            path = urllib.parse.urlsplit(self.path)
            if path.path == "/start":
                self.send_response(302)
                self.send_header("Location", auth)
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            if path.path != "/oauth2callback":
                self.respond(404, "Page not found")
                return
            query = urllib.parse.parse_qs(path.query)
            if not secrets.compare_digest(query.get("state", [""])[0], state):
                self.respond(400, "This sign-in does not match this login window. Restart the helper.")
                return
            if not (query.get("code") or query.get("error")):
                self.respond(400, "Missing Google sign-in result.")
                return
            # Host/port are fixed and validated; no external redirects or proxy use.
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            target = "http://" + str(host) + ":8899" + self.path
            try:
                with opener.open(target, timeout=30) as response:
                    if response.status != 200:
                        raise OSError("Callback rejected")
                    response.read(32768)
            except (OSError, urllib.error.URLError):
                self.respond(502, "The development Mac could not receive the sign-in. Check Tailscale and try again.")
                return
            self.respond(200, "<h2>Google sign-in sent to the development Mac.</h2>"
                         "<p>Return to Codex. The uploader will verify the channel and continue the Unlisted upload.</p>")
            done.set()

    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 8899), Callback)
    except OSError:
        raise SystemExit("Port 8899 is already in use on this Mac. Close the previous login helper first.")
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    print("Opening Google in your browser. Select @MarbleFormula and complete authorization.")
    print("If the browser does not open, visit http://127.0.0.1:8899/start on THIS Mac.")
    webbrowser.open("http://127.0.0.1:8899/start")
    try:
        if not done.wait(1800):
            print("Sign-in timed out. You can run this helper again.")
        else:
            print("Sign-in delivered. Check Codex for verified YouTube upload progress.")
            time.sleep(1)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
