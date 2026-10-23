#!/usr/bin/env python3
"""Board themes: one source of truth for colour tokens, plus a WCAG contrast audit.
build.py injects css() into the template and refuses to build if audit() finds a failure.
Run directly to print the contrast report:  python3 tools/themes.py"""
import re, sys, urllib.parse

def sadu_band():
    # Woven sadu strip: cream edge lines, red ground, black and cream zigzags.
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="22" viewBox="0 0 40 22">'
           '<rect width="40" height="22" fill="#8E2B25"/>'
           '<rect y="0" width="40" height="2" fill="#EFE4CF"/><rect y="20" width="40" height="2" fill="#EFE4CF"/>'
           '<path d="M0 17 L10 6 L20 17 L30 6 L40 17 L40 19 L30 8 L20 19 L10 8 L0 19Z" fill="#1A1426"/>'
           '<path d="M5 4 L10 9 L15 4Z M25 4 L30 9 L35 4Z" fill="#EFE4CF"/>'
           '<circle cx="20" cy="9" r="1.6" fill="#EFE4CF"/><circle cx="0" cy="9" r="1.6" fill="#EFE4CF"/><circle cx="40" cy="9" r="1.6" fill="#EFE4CF"/>'
           '</svg>')
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" :/=,'") + '")'

SADU = sadu_band()

# Token order matters only for readability. Every theme defines every token.
THEMES = {
  "chalk": dict(
    name="Classroom chalkboard", scheme="dark",
    slate="#1F2A24", slate_deep="#17201B", slate_up="#2A3830",
    chalk="#EDEBE4", chalk_2="rgba(237,235,228,.72)", chalk_3="rgba(237,235,228,.42)", chalk_line="rgba(237,235,228,.22)",
    logo="#EDEBE4", logo_glow="none", focus="#F5B544",
    bulb="#F5B544", run1="#FFD27A", run2="#F28B3C", run3="#F2669A", bulb_off="#4A4636", wire="#0E1411", cap="#3B3A33",
    t0="#E8857B", t1="#8FB3D9", t2="#F2D06B", t3="#93C78A",
    bt0="#E8857B", bt1="#8FB3D9", bt2="#F2D06B", bt3="#93C78A",
    board_bg="#17201B", board_ink="#EDEBE4", board_accent="#F5B544", board_line="rgba(237,235,228,.22)",
    ok_text="#8FCB86", no_text="#F08A85", miss_text="#F2A29E", danger_text="#F0A19D",
    overlay="rgba(23,32,27,.96)",
    surface_bg="radial-gradient(120% 70% at 15% 0%, rgba(255,255,255,.055), transparent 60%), radial-gradient(80% 60% at 90% 100%, rgba(255,255,255,.04), transparent 65%), #1F2A24",
    surface_stops=["#1F2A24", "#283328"],
    frame_bg="repeating-linear-gradient(92deg,rgba(0,0,0,.08) 0 2px,transparent 2px 9px), linear-gradient(180deg,#8A6443,#6B4A2F)",
    wood="#6B4A2F",
  ),
  "cork": dict(
    name="Diner corkboard", scheme="light",
    slate="#CDA77A", slate_deep="#B8915F", slate_up="#D8B58B",
    chalk="#22160B", chalk_2="rgba(34,22,11,.80)", chalk_3="rgba(34,22,11,.60)", chalk_line="rgba(34,22,11,.24)",
    logo="#7E0E37", logo_glow="0 0 14px rgba(255,70,150,.55), 0 0 2px rgba(255,140,190,.9)", focus="#7E0E37",
    bulb="#FFB13D", run1="#FFD27A", run2="#FF7A3D", run3="#FF3E8A", bulb_off="#8C6E4E", wire="#2A1C10", cap="#5A5A5E",
    t0="#8A1C1C", t1="#173F72", t2="#5A3F00", t3="#1D5523",
    bt0="#FF9B8F", bt1="#9CC4F5", bt2="#FFD86B", bt3="#9FE09A",
    board_bg="#1C1C1F", board_ink="#F4F1EA", board_accent="#FF8FC0", board_line="rgba(244,241,234,.18)",
    ok_text="#1D5523", no_text="#8A1C1C", miss_text="#6E1010", danger_text="#5C0C0C",
    overlay="rgba(205,167,122,.97)",
    surface_bg=("radial-gradient(circle at 30% 30%, rgba(95,58,25,.22) 0 1.3px, transparent 1.7px) 0 0/9px 9px, "
                "radial-gradient(circle at 70% 60%, rgba(255,244,220,.22) 0 1px, transparent 1.5px) 0 0/7px 7px, "
                "radial-gradient(120% 80% at 50% 0%, rgba(255,240,210,.18), transparent 60%), #CDA77A"),
    surface_stops=["#CDA77A", "#D4B188", "#C59E70"],
    frame_bg="linear-gradient(180deg,#F1F4F6,#9AA4AB 45%,#DDE3E7 55%,#8E979E)",
    wood="#3A3A3E",
  ),
  "majlis": dict(
    name="Desert-night majlis", scheme="dark",
    slate="#1E1B38", slate_deep="#14122A", slate_up="#2A2650",
    chalk="#F1E6CF", chalk_2="rgba(241,230,207,.74)", chalk_3="rgba(241,230,207,.44)", chalk_line="rgba(241,230,207,.22)",
    logo="#F1E6CF", logo_glow="0 0 18px rgba(242,181,68,.35)", focus="#F6C766",
    bulb="#F2B544", run1="#FFD27A", run2="#F08A3C", run3="#E8574F", bulb_off="#3E3858", wire="#0B0A18", cap="#9A7432",
    t0="#F2937F", t1="#A9BCFA", t2="#F2D06B", t3="#93D3A8",
    bt0="#F2937F", bt1="#A9BCFA", bt2="#F2D06B", bt3="#93D3A8",
    board_bg="#14122A", board_ink="#F1E6CF", board_accent="#F6C766", board_line="rgba(241,230,207,.2)",
    ok_text="#93D3A8", no_text="#F59A8E", miss_text="#F7A79F", danger_text="#F7A79F",
    overlay="rgba(20,18,42,.96)",
    surface_bg="radial-gradient(110% 60% at 50% 0%, rgba(242,181,68,.10), transparent 60%), radial-gradient(80% 60% at 90% 100%, rgba(255,255,255,.035), transparent 65%), #1E1B38",
    surface_stops=["#1E1B38", "#2A2540"],
    frame_bg=SADU + " 0 0/40px 22px",
    wood="#8E2B25",
  ),
  "garden": dict(
    name="Garden party", scheme="dark",
    slate="#1E3027", slate_deep="#142219", slate_up="#2A4034",
    chalk="#F5EFDD", chalk_2="rgba(245,239,221,.74)", chalk_3="rgba(245,239,221,.44)", chalk_line="rgba(245,239,221,.22)",
    logo="#F5EFDD", logo_glow="0 0 16px rgba(247,198,107,.3)", focus="#F7C66B",
    bulb="#F7C66B", run1="#FFE08A", run2="#F49A5C", run3="#F2789E", bulb_off="#3E4A42", wire="#0C1510", cap="#2E2A24",
    t0="#F59A8C", t1="#9CC3F0", t2="#F5D86E", t3="#A6DC95",
    bt0="#F59A8C", bt1="#9CC3F0", bt2="#F5D86E", bt3="#A6DC95",
    board_bg="#142219", board_ink="#F5EFDD", board_accent="#F7C66B", board_line="rgba(245,239,221,.2)",
    ok_text="#A6DC95", no_text="#F59A8C", miss_text="#F7A99F", danger_text="#F7A99F",
    overlay="rgba(20,34,25,.96)",
    surface_bg="linear-gradient(180deg, #2B2B52 0%, #25384C 42%, #1B3427 100%)",
    surface_stops=["#2B2B52", "#25384C", "#1B3427"],
    frame_bg="repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 2px,transparent 2px 14px), linear-gradient(180deg,#5E9468,#3E6B47)",
    wood="#3E6B47",
  ),
}
CARD = dict(card="#F6F0DC", ink="#26221C", ink_2="#6A6253")
LIGHTS = {"chalk": "bulb", "cork": "bulb", "majlis": "lantern", "garden": "paper"}

# ---------- css ----------
def _var(k): return "--" + k.replace("_", "-")
SKIP = {"name", "scheme", "surface_stops"}
def block(t):
    lines = [f"{_var(k)}:{v};" for k, v in t.items() if k not in SKIP]
    lines.append(f"color-scheme:{t['scheme']};")
    return " ".join(lines)
def css():
    out = [":root{--sadu:" + SADU + "}", ":root,[data-board=\"chalk\"]{" + block(THEMES["chalk"]) + "}"]
    for tid, t in THEMES.items():
        if tid != "chalk": out.append(f"[data-board=\"{tid}\"]{{" + block(t) + "}")
    return "\n".join(out)

# ---------- contrast ----------
def parse(c):
    c = c.strip()
    m = re.match(r"#([0-9a-fA-F]{6})$", c)
    if m: h = m.group(1); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (1.0,)
    m = re.match(r"rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$", c)
    if m: return (int(m.group(1)), int(m.group(2)), int(m.group(3)), float(m.group(4)))
    raise ValueError(c)
def over(fg, bg):
    a = fg[3]; return tuple(round(fg[i]*a + bg[i]*(1-a)) for i in range(3)) + (1.0,)
def lum(c):
    def ch(v):
        v /= 255; return v/12.92 if v <= 0.03928 else ((v+0.055)/1.055) ** 2.4
    r, g, b = (ch(x) for x in c[:3]); return 0.2126*r + 0.7152*g + 0.0722*b
def ratio(fg, bg):
    bgc = parse(bg); f = over(parse(fg), bgc)
    l1, l2 = sorted([lum(f), lum(bgc)], reverse=True); return (l1 + 0.05) / (l2 + 0.05)

def checks(tid, t):
    """(label, fg, bg-list, minimum). 4.5 = normal text, 3.0 = large text or UI graphics."""
    surf = t["surface_stops"]; ov = over(parse(t["overlay"]), parse(t["slate"]))
    ovhex = "#%02X%02X%02X" % ov[:3]
    rows = [
      ("Body text (chalk)",              t["chalk"],        surf, 4.5),
      ("Secondary text (chalk-2)",       t["chalk_2"],      surf, 4.5),
      ("Input borders (chalk-3)",        t["chalk_3"],      surf, 3.0),
      ("Logo (large)",                   t["logo"],         surf, 3.0),
      ("Focus ring",                     t["focus"],        surf, 3.0),
      ("Pass button text (large)",       t["miss_text"],    surf, 3.0),
      ("Danger button text",             t["danger_text"],  surf, 4.5),
      ("Recap right mark (large)",       t["ok_text"],      surf, 3.0),
      ("Recap passed mark (large)",      t["no_text"],      surf, 3.0),
      ("Overlay text",                   t["chalk"],        [ovhex], 4.5),
      ("Overlay secondary text",         t["chalk_2"],      [ovhex], 4.5),
      ("Scoreboard text",                t["board_ink"],    [t["board_bg"]], 4.5),
      ("Scoreboard '+N this turn'",      t["board_accent"], [t["board_bg"]], 4.5),
    ] + [(f"Team {i+1} name (large)", t[f"t{i}"], surf, 3.0) for i in range(4)] \
      + [(f"Team {i+1} on scoreboard (large)", t[f"bt{i}"], [t["board_bg"]], 3.0) for i in range(4)]
    return rows

def audit(verbose=True):
    fails, report = [], []
    report.append("Shared index card (every theme): ink %.1f:1, ink-2 %.1f:1 on cream" % (ratio(CARD["ink"], CARD["card"]), ratio(CARD["ink_2"], CARD["card"])))
    for tid, t in THEMES.items():
        report.append(f"\n{t['name']} ({tid})")
        for label, fg, bgs, need in checks(tid, t):
            worst = min(ratio(fg, b) for b in bgs)
            ok = worst >= need
            report.append(f"  {'ok  ' if ok else 'FAIL'} {label:34s} {worst:5.2f}:1  (needs {need})")
            if not ok: fails.append(f"{tid}: {label} {worst:.2f} < {need}")
    if verbose: print("\n".join(report))
    return fails, "\n".join(report)

if __name__ == "__main__":
    f, _ = audit(); sys.exit(1 if f else 0)
