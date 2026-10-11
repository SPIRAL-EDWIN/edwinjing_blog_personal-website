#!/usr/bin/env python3
"""Serve built MkDocs HTML with local-only navigation measurements.

The probe never modifies site files and is not included in deployment output.
Use --delay-path '/OsdNotes/PHIL/PHIL 206/' --delay-seconds 12 to exercise a
slow HTML response, including Archive's loading-feedback lifecycle.
"""

import argparse
import functools
import html
import json
import re
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


PROBE_START = r"""<script>
(function () {
  var records = [];
  var pending = null;
  window.__navigationProbe = { records: records };
  var prefetchSupported = null;
  try { prefetchSupported = document.createElement('link').relList.supports('prefetch'); } catch (_) {}
  function publish() {
    if (document.body) document.body.setAttribute('data-navigation-probe', JSON.stringify({records: records, pending: pending, prefetchSupported: prefetchSupported}));
  }
  function path(url) { return decodeURIComponent(new URL(url, location.href).pathname); }
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!link.closest('.md-sidebar--primary, .md-tabs, .md-content__inner') || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    var destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || destination.pathname === location.pathname || /\.[a-z0-9]+$/i.test(destination.pathname)) return;
    pending = { start: performance.now(), source: path(location.href), target: path(link.href), href: link.href, feedback: [] };
    window.__navigationProbe.pending = pending;
    publish();
  }, true);
  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__probePath = path(url);
    this.__probeCompleted = false;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    var started = performance.now();
    function finish() {
      if (!pending || xhr.__probePath !== pending.target) return;
      // Material's load handler unsubscribes and calls abort(), which resets
      // status to zero before loadend. Capture DONE before that teardown and
      // never overwrite a captured response with its subsequent abort event.
      if (xhr.__probeCompleted) return;
      xhr.__probeCompleted = true;
      pending.xhrMs = performance.now() - started;
      pending.clickToXhrMs = performance.now() - pending.start;
      pending.xhrStatus = xhr.status;
      publish();
    }
    xhr.addEventListener('readystatechange', function () {
      if (xhr.readyState === 4) finish();
    });
    xhr.addEventListener('loadend', function () {
      if (!xhr.__probeCompleted) finish();
    });
    return originalSend.apply(this, arguments);
  };
  document.addEventListener('DOMContentLoaded', function () {
    var observer = new MutationObserver(function (changes) {
      if (!pending || !changes.some(function (change) { return change.type === 'attributes' && change.attributeName === 'class' && change.target === document.body; })) return;
      var visible = document.body.classList.contains('is-archive-navigating') || document.body.classList.contains('is-page-navigating');
      var last = pending.feedback[pending.feedback.length - 1];
      if (!last || last.visible !== visible) {
        pending.feedback.push({ ms: performance.now() - pending.start, visible: visible, oldArchivePresent: !!document.querySelector('.archive-card__link') });
        publish();
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    publish();
  });
  window.__navigationProbe.subscribe = function () {
    if (!window.document$) return;
    window.document$.subscribe(function () {
      if (!pending || pending.clickToDocumentMs != null || path(location.href) !== pending.target) return;
      pending.clickToDocumentMs = performance.now() - pending.start;
      pending.afterXhrMs = pending.clickToXhrMs == null ? null : pending.clickToDocumentMs - pending.clickToXhrMs;
      var heading = document.querySelector('.md-content__inner h1');
      pending.heading = heading && heading.textContent.trim();
      pending.oldArchivePresent = !!document.querySelector('.archive-card__link');
      records.push(JSON.parse(JSON.stringify(pending)));
      publish();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var record = records[records.length - 1];
          if (record && record.start === pending.start) {
            record.clickToPaintMs = performance.now() - record.start;
            publish();
          }
        });
      });
    });
  };
})();
</script>"""

PROBE_END = "<script>window.__navigationProbe.subscribe();</script>"


class ProbeHandler(SimpleHTTPRequestHandler):
    delay_paths = set()
    fail_paths = set()
    delay_seconds = 0

    def do_GET(self):
        pathname = unquote(urlsplit(self.path).path)
        if pathname in self.delay_paths:
            time.sleep(self.delay_seconds)
        if pathname in self.fail_paths:
            self.send_error(503, "Controlled navigation-probe failure")
            return
        translated = Path(self.translate_path(self.path))
        if translated.is_dir():
            translated = translated / "index.html"
        if translated.name == "sitemap.xml" and translated.is_file():
            xml = translated.read_text(encoding="utf-8")
            base = f"http://127.0.0.1:{self.server.server_port}"
            xml = re.sub(r"(<loc>)([^<]+)(</loc>)", lambda match: match[1] + base + urlsplit(match[2]).path + match[3], xml)
            output = xml.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/xml; charset=utf-8")
            self.send_header("Content-Length", str(len(output)))
            self.end_headers()
            self.wfile.write(output)
            return
        if translated.suffix == ".html" and translated.is_file():
            html = translated.read_text(encoding="utf-8")
            html = html.replace("</head>", PROBE_START + "</head>", 1)
            html = html.replace("</body>", self.warning_html() + PROBE_END + "</body>", 1)
            output = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(output)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(output)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        super().do_GET()

    def warning_html(self):
        modes = []
        if self.delay_paths and self.delay_seconds:
            paths = "、".join(sorted(self.delay_paths))
            modes.append(f"HTML 人为延迟 {self.delay_seconds:g} 秒：{paths}")
        if self.fail_paths:
            modes.append("人为 HTTP 503：" + "、".join(sorted(self.fail_paths)))
        if not modes:
            return ""
        message = html.escape("本地故障模拟（非正常预览） · " + "；".join(modes))
        return ('<aside data-navigation-probe-warning role="status" '
                'style="position:fixed;bottom:12px;right:12px;z-index:2147483647;'
                'max-width:calc(100vw - 24px);padding:10px 14px;border-radius:8px;'
                'background:#fff2cc;color:#5c3900;border:1px solid #a76e00;'
                'font:14px/1.5 sans-serif;overflow-wrap:anywhere">' + message + '</aside>')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-dir", type=Path, default=Path(__file__).resolve().parents[1] / "site")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--delay-path", action="append", default=[])
    parser.add_argument("--delay-seconds", type=float, default=0)
    parser.add_argument("--fail-path", action="append", default=[])
    args = parser.parse_args()
    if args.delay_seconds < 0 or not args.site_dir.is_dir():
        parser.error("Use an existing site directory and a nonnegative delay")
    ProbeHandler.delay_paths = {unquote(path) for path in args.delay_path}
    ProbeHandler.fail_paths = {unquote(path) for path in args.fail_path}
    ProbeHandler.delay_seconds = args.delay_seconds
    handler = functools.partial(ProbeHandler, directory=str(args.site_dir.resolve()))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(json.dumps({"url": f"http://127.0.0.1:{args.port}/", "site_dir": str(args.site_dir.resolve()), "delay_paths": sorted(ProbeHandler.delay_paths), "delay_seconds": args.delay_seconds}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
