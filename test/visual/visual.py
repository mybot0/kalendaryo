#!/usr/bin/env python3
"""
Design Lock screenshot test: compares every main screen with the approved photos in test/visual/approved/.
If any screen changed (more than a few pixels), the test FAILS, so a design change can't slip into a push.

  DATABASE_URL=postgres://... python3 test/visual/visual.py              check every screen (exit 1 if any changed)
  DATABASE_URL=postgres://... python3 test/visual/visual.py --approve    save the current screens as the new approved look
  ... --approve start-phone demo-home-phone                              approve only these screens
  ... --only games                                                       only screens whose name contains "games"

Needs: python3 + playwright (chromium) + Pillow, and a Postgres database (a test one is fine; it adds test homes).
It starts its own server (port 4377) with Triply on, so it looks like the live site.
Everything that could change by itself is frozen: clock (Nov 20, 2026, 10:00 Vancouver), random numbers,
fonts (local copies in fonts/, OFL), animations, and the internet (weather and photos are blocked).
Results: out/<name>.png, and out/<name>-diff.png (changed pixels in red) for screens that changed.
Only approve after the founder said yes to the change ("yes, change the design").
"""
import json, os, shutil, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
APPROVED, OUT, FONTS = (os.path.join(HERE, d) for d in ('approved', 'out', 'fonts'))
PORT = 4377
BASE = f'http://localhost:{PORT}'
OWNER_KEY = 'visual-test-owner-key'
DAY = '2026-11-20'
CLOCK = DAY + 'T10:00:00-08:00'
SIZES = {'phone': (390, 844, True), 'ipad': (820, 1180, True), 'ipad-side': (1180, 820, True), 'ipad-side-small': (1024, 768, True), 'desktop': (1440, 900, False)}
TOLERANCE = 0.001  # a screen fails if more than 0.1% of its pixels changed

FONT_CSS = ''.join(
    f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:block;src:url(https://fonts.gstatic.com/__vt/{file}-latin-{w}-normal.woff2) format('woff2')}}"
    for fam, file, ws in (('Figtree', 'figtree', (400, 600, 700, 800)), ('Outfit', 'outfit', (600, 700, 800)),
                          ('Lilita One', 'lilita-one', (400,)), ('Nunito', 'nunito', (600, 800))) for w in ws)
FREEZE = """(() => {
  let s = 20261120; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  try { localStorage.setItem('kal.tour', 'off'); } catch (e) {}
})();"""
STILL = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'


def api(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={**({'Authorization': 'Bearer ' + token} if token else {}), **({'Content-Type': 'application/json'} if body is not None else {})})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b'null')


def care_board():
    """A test home with Nana Rosa, one medicine and one event, and her Care board link."""
    f = api('POST', '/api/families', body={'familyName': 'Visual test', 'yourName': 'Maya'})
    t = f['token']
    put = lambda col, id, data: api('PUT', f'/api/docs/{col}/{id}', t, {'data': data})
    put('members', 'nana1', {'name': 'Nana Rosa', 'role': 'other', 'avatar': '🌻', 'color': '#F1DC8B'})
    put('meds', 'm1', {'who': 'nana1', 'name': 'Amlodipine', 'kind': 'bp', 'times': ['08:00', '20:00'], 'each': 1, 'count': 30, 'box': 30, 'start': DAY})
    put('events', 'e1', {'title': 'Doctor visit', 'date': DAY, 'start': '14:00', 'end': '15:00', 'memberIds': ['nana1']})
    return api('POST', '/api/care/links', t, {'memberId': 'nana1'})['link']['url'].split('/care/')[1]


def screens(board):
    """(name, size, url, what to do after the page loads)"""
    def nav(screen): return lambda pg: (pg.evaluate(f"PL.nav.go('{screen}')"), pg.wait_for_timeout(700))
    def wall(pg): pg.evaluate('PL.wall.open()'); pg.wait_for_timeout(1200)
    def game(title): return lambda pg: (pg.get_by_text(title, exact=False).first.click(), pg.wait_for_timeout(1200))
    out = [('start-' + s, s, '/', None) for s in ('phone', 'desktop')]
    for scr in ('home', 'calendar', 'lists', 'meals', 'tasks', 'family', 'settings'):
        out += [(f'demo-{scr}-{s}', s, '/demo', nav(scr)) for s in ('phone', 'ipad', 'desktop')]
    out += [('demo-home-' + s, s, '/demo', nav('home')) for s in ('ipad-side', 'ipad-side-small')]
    out += [('wall-ipad-side', 'ipad-side', '/demo', wall)]
    out += [('games-' + s, s, '/games', None) for s in ('phone', 'ipad')]
    out += [('pares-' + s, s, '/games', game('Pares-Pares')) for s in ('phone', 'ipad', 'ipad-side')]
    out += [('snake-' + s, s, '/games', game('Snake')) for s in ('phone', 'ipad-side')]
    out += [('triply-' + s, s, '/triply/', None) for s in ('phone', 'desktop')]
    out += [('care-' + s, s, '/care/' + board, None) for s in ('ipad', 'ipad-side', 'phone')]
    out += [('owner-login-' + s, s, '/owner', None) for s in ('phone', 'desktop')]
    return out


def route(r):
    url = r.request.url
    if url.startswith(BASE):
        return r.continue_()
    if url.startswith('https://fonts.googleapis.com/'):
        return r.fulfill(body=FONT_CSS, content_type='text/css', headers={'Access-Control-Allow-Origin': '*'})
    if url.startswith('https://fonts.gstatic.com/__vt/'):
        return r.fulfill(path=os.path.join(FONTS, url.rsplit('/', 1)[1]), content_type='font/woff2', headers={'Access-Control-Allow-Origin': '*'})
    return r.abort()  # weather, photos, anything else on the internet: blocked so screens never change by themselves


def shoot(only):
    os.makedirs(OUT, exist_ok=True)
    env = dict(os.environ, PORT=str(PORT), OWNER_KEY=OWNER_KEY, OWNER_GEO='0', TRIPLY_ENABLED='1')
    srv = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        for _ in range(150):
            try:
                urllib.request.urlopen(BASE + '/'); break
            except Exception:
                time.sleep(0.1)
        board = care_board()
        names = []
        with sync_playwright() as p:
            b = p.chromium.launch()
            for name, size, url, act in screens(board):
                if only and not any(o in name for o in only):
                    continue
                w, h, mobile = SIZES[size]
                c = b.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1,
                                  timezone_id='America/Vancouver', locale='en-US', reduced_motion='reduce')
                c.clock.set_fixed_time(CLOCK)
                c.add_init_script(FREEZE)
                c.route('**/*', route)
                pg = c.new_page()
                pg.goto(BASE + url, wait_until='networkidle')
                pg.add_style_tag(content=STILL)
                pg.evaluate('document.fonts.ready')
                pg.wait_for_timeout(1200)
                if act:
                    act(pg)
                pg.add_style_tag(content=STILL)
                pg.wait_for_timeout(400)
                pg.screenshot(path=os.path.join(OUT, name + '.png'))
                names.append(name)
                c.close()
            b.close()
        return names
    finally:
        srv.terminate()


def compare(name):
    a, b = os.path.join(APPROVED, name + '.png'), os.path.join(OUT, name + '.png')
    if not os.path.exists(a):
        return 'NEW (no approved photo yet)'
    x, y = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    if x.size != y.size:
        return f'CHANGED (size {x.size} -> {y.size})'
    r, g, bl = ImageChops.difference(x, y).split()  # biggest change in any color channel, so even a slightly different shade counts
    mask = ImageChops.lighter(ImageChops.lighter(r, g), bl).point(lambda v: 255 if v > 4 else 0)
    n = mask.histogram()[255]
    if n / (x.size[0] * x.size[1]) <= TOLERANCE:
        return None
    red = Image.new('RGB', x.size, (230, 30, 30))
    Image.composite(red, y.point(lambda v: v // 3 + 170), mask).save(os.path.join(OUT, name + '-diff.png'))
    return f'CHANGED ({n} pixels)'


def main():
    args = sys.argv[1:]
    only = args[args.index('--only') + 1:] if '--only' in args else []
    approve = '--approve' in args
    pick = [a for a in args[args.index('--approve') + 1:] if not a.startswith('--')] if approve else []
    names = shoot(only or pick)
    if approve:
        os.makedirs(APPROVED, exist_ok=True)
        for n in names:
            shutil.copy(os.path.join(OUT, n + '.png'), os.path.join(APPROVED, n + '.png'))
        print(f'Approved {len(names)} screens.')
        return 0
    bad = [(n, r) for n in names for r in [compare(n)] if r]
    print(f'Design Lock: checked {len(names)} screens, {len(bad)} changed.')
    for n, r in bad:
        print(f'  {n}: {r}  -> see test/visual/out/{n}-diff.png')
    if bad:
        print('STOP: do not push. Show these to the founder. Approve only after "yes, change the design".')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
