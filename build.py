"""
Build script for Ear Protection extension.
Produces two zip files in dist/:
  - ear-protection-chrome.zip   (Chrome Web Store)
  - ear-protection-firefox.zip  (Mozilla Add-ons)
"""

import json, struct, zlib, zipfile, shutil, os
from pathlib import Path

ROOT = Path(__file__).parent
DIST = ROOT / "dist"
ICON_SVG = ROOT / "icons" / "icon.svg"

ACCENT = (108, 99, 255)
WHITE = (255, 255, 255)

SOURCE_FILES = [
    "background.js",
    "content.js",
    "popup/popup.html",
    "popup/popup.css",
    "popup/popup.js",
]

# ── PNG generation (pure Python, no dependencies) ──

def make_png(size, bg=ACCENT, fg=WHITE):
    """Render a simple icon: rounded-rect background with a headphone shape."""
    pixels = []
    r = size * 0.22  # corner radius
    cx, cy = size / 2, size / 2

    for y in range(size):
        row = []
        for x in range(size):
            # Rounded rectangle mask
            if _in_rounded_rect(x, y, size, size, r):
                # Draw a simplified headphone glyph
                if _in_headphone(x, y, size):
                    row.extend((*fg, 255))
                else:
                    row.extend((*bg, 255))
            else:
                row.extend((0, 0, 0, 0))
        pixels.append(bytes(row))

    return _encode_png(size, size, pixels)


def _in_rounded_rect(x, y, w, h, r):
    """Check if (x,y) is inside a rounded rectangle of size w x h."""
    if x < r and y < r:
        return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x >= w - r and y < r:
        return (x - (w - r - 1)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y >= h - r:
        return (x - r) ** 2 + (y - (h - r - 1)) ** 2 <= r * r
    if x >= w - r and y >= h - r:
        return (x - (w - r - 1)) ** 2 + (y - (h - r - 1)) ** 2 <= r * r
    return True


def _in_headphone(x, y, size):
    """Simplified headphone icon drawn with math (band + two ear cups + sound waves)."""
    s = size
    cx, cy = s / 2, s / 2
    nx, ny = x / s, y / s  # normalised 0..1

    # Band (arc from left ear to right ear)
    band_cx, band_cy = 0.5, 0.56
    band_r_outer = 0.32
    band_r_inner = 0.27
    dx, dy = nx - band_cx, ny - band_cy
    dist = (dx * dx + dy * dy) ** 0.5
    if band_r_inner <= dist <= band_r_outer and ny < 0.56:
        return True

    # Left ear cup
    if 0.17 <= nx <= 0.30 and 0.48 <= ny <= 0.72:
        ear_r = 0.04
        ew, eh = 0.13, 0.24
        ecx, ecy = 0.235, 0.60
        if abs(nx - ecx) <= ew / 2 and abs(ny - ecy) <= eh / 2:
            return True

    # Right ear cup
    if 0.70 <= nx <= 0.83 and 0.48 <= ny <= 0.72:
        ew, eh = 0.13, 0.24
        ecx, ecy = 0.765, 0.60
        if abs(nx - ecx) <= ew / 2 and abs(ny - ecy) <= eh / 2:
            return True

    # Sound waves (two small arcs in the center)
    for sign in (-1, 1):
        for ri, ro in ((0.04, 0.07), (0.09, 0.12)):
            wave_cx = 0.5 + sign * 0.02
            wave_cy = 0.54
            d = ((nx - wave_cx) ** 2 + (ny - wave_cy) ** 2) ** 0.5
            if ri <= d <= ro and 0.46 <= ny <= 0.62:
                if sign == -1 and nx <= wave_cx:
                    return True
                if sign == 1 and nx >= wave_cx:
                    return True

    return False


def _encode_png(w, h, rows):
    """Encode RGBA pixel rows into a valid PNG file."""

    def chunk(ctype, data):
        c = ctype + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))

    raw = b""
    for row in rows:
        raw += b"\x00" + row  # filter byte 0 (None) per row

    idat = chunk(b"IDAT", zlib.compress(raw, 9))
    iend = chunk(b"IEND", b"")

    return sig + ihdr + idat + iend


# ── Manifest helpers ──

def chrome_manifest(src):
    m = json.loads(src)
    m.pop("browser_specific_settings", None)
    m["background"] = {"service_worker": "background.js"}
    for key in ("icons", "action"):
        if key in m:
            section = m[key] if key == "icons" else m[key].get("default_icon", {})
            for size in list(section):
                section[size] = section[size].replace("icon.svg", f"icon{size}.png")
    return json.dumps(m, indent=2, ensure_ascii=False) + "\n"


def firefox_manifest(src):
    m = json.loads(src)
    m["background"] = {"scripts": ["background.js"]}
    for key in ("icons", "action"):
        if key in m:
            section = m[key] if key == "icons" else m[key].get("default_icon", {})
            for size in list(section):
                section[size] = section[size].replace("icon.svg", f"icon{size}.png")
    return json.dumps(m, indent=2, ensure_ascii=False) + "\n"


# ── Build ──

def build():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()

    manifest_src = (ROOT / "manifest.json").read_text("utf-8")

    icon_sizes = [16, 48, 128]
    icons = {}
    for sz in icon_sizes:
        icons[sz] = make_png(sz)
        print(f"  generated icon{sz}.png ({len(icons[sz])} bytes)")

    for target in ("chrome", "firefox"):
        zip_path = DIST / f"ear-protection-{target}.zip"
        manifest_text = chrome_manifest(manifest_src) if target == "chrome" else firefox_manifest(manifest_src)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", manifest_text)

            for rel in SOURCE_FILES:
                zf.write(ROOT / rel, rel)

            for sz in icon_sizes:
                zf.writestr(f"icons/icon{sz}.png", icons[sz])

        print(f"  {zip_path.name} ({zip_path.stat().st_size:,} bytes)")

    print("\nDone! Upload these files:")
    print("  Chrome Web Store  -> dist/ear-protection-chrome.zip")
    print("  Mozilla Add-ons   -> dist/ear-protection-firefox.zip")


if __name__ == "__main__":
    build()
