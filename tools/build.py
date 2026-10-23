#!/usr/bin/env python3
"""Build www/index.html (native) and preview/index.html (web preview) from src/.
Run from repo root:  python3 tools/build.py"""
import os, subprocess, sys, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_words.py")], check=True)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import themes
fails, report = themes.audit(verbose=False)
open(os.path.join(ROOT, "docs", "contrast-report.txt"), "w", encoding="utf-8").write(report + "\n")
if fails:
    print("Contrast audit failed:\n  " + "\n  ".join(fails)); sys.exit(1)
print("contrast audit: all theme text pairs pass WCAG AA (docs/contrast-report.txt)")
tpl = open(os.path.join(ROOT, "src", "index.template.html"), encoding="utf-8").read().replace("/*__THEMES__*/", themes.css())
words = open(os.path.join(ROOT, "build", "words.js"), encoding="utf-8").read()
GOOGLE = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
          '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
          '<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;600;700'
          '&family=Cabin+Sketch:wght@700&family=Cairo:wght@500;700;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">')
NATIVE = '<script src="vendor/capacitor.js"></script>\n<script src="supabase-config.js"></script>'
def render(fonts, scripts):
    return (tpl.replace("<!--__FONTS__-->", fonts)
               .replace("<!--__NATIVE_SCRIPTS__-->", scripts)
               .replace("/*__WORDS__*/", words))
os.makedirs(os.path.join(ROOT, "www"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "preview"), exist_ok=True)
open(os.path.join(ROOT, "www", "index.html"), "w", encoding="utf-8").write(render("", NATIVE))
open(os.path.join(ROOT, "preview", "index.html"), "w", encoding="utf-8").write(render(GOOGLE, ""))
# vendor Capacitor core (IIFE build) so plugins work without a bundler
src = os.path.join(ROOT, "node_modules", "@capacitor", "core", "dist", "capacitor.js")
if os.path.exists(src):
    os.makedirs(os.path.join(ROOT, "www", "vendor"), exist_ok=True)
    shutil.copy(src, os.path.join(ROOT, "www", "vendor", "capacitor.js"))
    print("vendored", src)
else:
    print("note: node_modules/@capacitor/core not installed; keeping existing www/vendor/capacitor.js")
print("built www/index.html and preview/index.html")
