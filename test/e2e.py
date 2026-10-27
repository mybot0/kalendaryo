"""End-to-end test: real server + real Postgres + two browsers (owner and invited person)."""
import os, subprocess, sys, time, json, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3456
BASE = f'http://localhost:{PORT}'
env = dict(os.environ, NODE_PATH=os.pathsep.join(filter(None, [os.environ.get('KAL_TEST_MODULES', '/home/claude/kalweb-testdeps/node_modules'), os.environ.get('NODE_PATH')])), PORT=str(PORT), DATABASE_URL=os.environ.get('TEST_DATABASE_URL', 'postgres://postgres@localhost:5433/kal?host=/tmp'),
           ANTHROPIC_API_KEY='test', AI_DAILY_LIMIT='2', AI_FAKE=json.dumps({'title': 'Chicken adobo', 'ingredients': ['1 kg chicken', 'Soy sauce', 'Vinegar'], 'steps': ['Simmer.']}),
           HOLIDAYS_API='http://localhost:3498')
hol = subprocess.Popen(['node', 'test/fakes/holidays.js', '3498'], cwd=ROOT)  # stand-in for the public holiday list
srv = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for _ in range(50):
    try: urllib.request.urlopen(BASE + '/healthz'); break
    except Exception: time.sleep(0.2)

errors = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m); sys.stdout.flush()
    if not c: errors.append(m)

def req(method, path, token=None, body=None):
    r = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers=dict(({'Authorization': 'Bearer ' + token} if token else {}), **({'Content-Type': 'application/json'} if body is not None else {})))
    try:
        with urllib.request.urlopen(r) as resp: return resp.status, json.loads(resp.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        logs = []
        def mk(vp, guide=False):
            ctx = b.new_context(viewport=vp)
            if not guide:  # the first-visit guide is checked once below; other browsers skip it
                ctx.add_init_script("try { localStorage.setItem('kal.guide.start', '1'); localStorage.setItem('kal.tour', 'off') } catch (e) {}")
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: logs.append(str(e)))
            pg.on('console', lambda m: logs.append(m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_' not in m.text and 'status of 40' not in m.text and 'status of 429' not in m.text else None)
            return ctx, pg
        octx, owner = mk({'width': 1280, 'height': 900}, guide=True)

        # ---- start page, create a family
        owner.goto(BASE); owner.wait_for_timeout(400)
        # ---- first-visit guide: shows, can be skipped, and does not come back
        owner.wait_for_selector('.g-layer', timeout=4000)
        check(owner.locator('#g-title').inner_text() == 'Welcome to Kalendaryo!', 'guide shows on the first visit')
        owner.keyboard.press('ArrowRight'); owner.wait_for_timeout(500)
        check(owner.locator('.g-spot:not(.g-gone)').count() == 1, 'guide lights up part of the page')
        owner.get_by_role('button', name='Skip').click(); owner.wait_for_timeout(500)
        check(owner.locator('.g-layer').count() == 0, 'guide can be skipped')
        check(owner.locator('.g-glow').count() >= 1, 'after the guide, Start here glows')
        owner.reload(); owner.wait_for_timeout(1200)
        check(owner.locator('.g-layer').count() == 0, 'guide does not come back')
        owner.evaluate("localStorage.setItem('kal.tour', 'off')")  # page tours are checked separately
        check(owner.locator('text=Where home gets organized').count() == 1, 'start page shows')
        owner.screenshot(path='/home/claude/kal/dist/web-landing.png', full_page=True)
        owner.get_by_role('button', name='Create your home').click(); owner.wait_for_timeout(200)
        check(owner.locator('text=Please type your name').count() == 1, 'name is required')
        owner.fill('input[autocomplete=given-name]', 'Maya'); owner.fill('form.land-card input[autocomplete=off]', 'Santos family')
        owner.get_by_role('button', name='Create your home').click(); owner.wait_for_url('**/c/**'); owner.wait_for_timeout(1200)
        otoken = owner.url.split('/c/')[1]
        check(len(otoken) >= 30, 'owner got a personal link')
        check(owner.locator('text=That’s you, Maya!').count() == 1, 'the owner is in the family right away ("That’s you")')
        check(owner.locator('.sheet', has_text='Copy my link').count() == 1, 'and gets the tip to keep the link')
        owner.locator('.sheet .avatar-opt').nth(2).click(); owner.locator('.sheet input[type=date]').fill('1990-03-14')
        owner.locator('.sheet-foot').get_by_role('button', name='Done').click(); owner.wait_for_timeout(900)
        check('Santos family' in owner.title(), 'page title is the family name')
        st, me = req('GET', '/api/me', otoken)
        check(st == 200 and me['me']['role'] == 'owner' and me['family']['name'] == 'Santos family', 'server knows the owner')
        st, s0 = req('GET', '/api/state', otoken)
        mine = [d for d in s0['docs'].get('members', []) if d['id'] == me['me']['memberId']]
        check(len(mine) == 1 and mine[0]['data']['name'] == 'Maya' and mine[0]['data']['birthday'] == '1990-03-14' and mine[0]['data']['avatar'], 'owner profile saved with icon and birthday')

        # ---- data saves to the server
        owner.evaluate("PL.store.addEvent({title: 'Soccer practice', date: PL.D.today(), allDay: false, start: '17:00', end: '18:00', memberIds: []})")
        owner.wait_for_timeout(600)
        st, s = req('GET', '/api/state', otoken)
        check(any(d['data']['title'] == 'Soccer practice' for d in s['docs'].get('events', [])), 'event saved in Postgres')
        owner.reload(); owner.wait_for_timeout(1200)
        check(owner.locator('text=Soccer practice').count() >= 1, 'event is still there after reload')

        # ---- invite as viewer
        owner.get_by_role('button', name='People', exact=True).first.click(); owner.wait_for_timeout(600)
        check(owner.locator('.access-row', has_text='Maya (you)').count() == 1, 'people with access lists the owner')
        owner.get_by_role('button', name='Invite someone').click(); owner.wait_for_timeout(200)
        owner.fill('input[placeholder*="Grandma"]', 'Ana')
        owner.get_by_role('radio', name='Viewer').click()
        owner.locator('.sheet-foot').get_by_role('button', name='Create Ana’s link').click(); owner.wait_for_timeout(600)
        invite = owner.locator('.link-input').input_value()
        check('/join/' in invite, 'invite link created')
        owner.screenshot(path='/home/claude/kal/dist/web-invite.png')
        owner.locator('.sheet-foot').get_by_role('button', name='Close').click(); owner.wait_for_timeout(400)
        check(owner.locator('.access-row', has_text='Ana').count() == 1, 'open invite is listed')

        # ---- second person joins
        actx, ana = mk({'width': 390, 'height': 800})
        ana.goto(invite); ana.wait_for_timeout(800)
        check(ana.locator('text=You are invited to Santos family').count() == 1, 'join page shows the family')
        check(ana.locator('text=Viewer').count() >= 1, 'join page shows the role')
        ana.screenshot(path='/home/claude/kal/dist/web-join.png')
        ana.fill('input[placeholder="Your name"]', 'Ana')
        ana.get_by_role('button', name='Join Santos family').click(); ana.wait_for_url('**/c/**'); ana.wait_for_timeout(1500)
        atoken = ana.url.split('/c/')[1]
        check(atoken != otoken, 'Ana has her own link')
        check(ana.locator('text=That’s you, Ana!').count() == 1, 'a new person gets their own family profile')
        ana.get_by_role('button', name='Skip for now').click(); ana.wait_for_timeout(200)
        check(ana.locator('.role-banner:not([hidden])').count() == 1, 'viewer sees the view-only notice')
        ana.get_by_role('button', name='Calendar').first.click(); ana.wait_for_timeout(500)
        check(ana.locator('text=Soccer practice').count() >= 1, 'Ana sees the family calendar')
        ana.evaluate("PL.store.addEvent({title: 'Should not save', date: PL.D.today(), allDay: true, memberIds: []})"); ana.wait_for_timeout(500)
        check(ana.locator('.toast.show', has_text='You can only view').count() == 1, 'viewer cannot change things')
        st, _ = req('PUT', '/api/docs/events/x1', atoken, {'data': {'title': 'hack'}})
        check(st == 403, 'server blocks viewer writes')
        # invite works once
        st, _ = req('POST', '/api/join', None, {'code': invite.split('/join/')[1], 'name': 'Someone else'})
        check(st == 410, 'invite link cannot be used twice')

        # ---- live updates: owner adds, viewer sees it without reload
        owner.evaluate("PL.store.addEvent({title: 'Piano lesson', date: PL.D.today(), allDay: false, start: '15:00', end: '16:00', memberIds: []})")
        ana.wait_for_timeout(1500)
        check(ana.locator('text=Piano lesson').count() >= 1, 'viewer sees new event live')

        # ---- promote Ana to editor, live
        owner.wait_for_timeout(500)
        owner.locator('.access-row', has_text='Ana').get_by_role('button', name='Change').click(); owner.wait_for_timeout(200)
        owner.get_by_role('radio', name='Editor').click()
        owner.get_by_role('button', name='Save').click(); owner.wait_for_timeout(1500)
        check(ana.locator('.role-banner:not([hidden])').count() == 0, 'promotion reaches Ana live (notice gone)')
        ana.evaluate("PL.store.add('lists', {title: 'Groceries'})"); ana.wait_for_timeout(1200)
        owner.get_by_role('button', name='Lists').first.click(); owner.wait_for_timeout(600)
        check(owner.locator('.list-card', has_text='Groceries').count() == 1, 'editor change reaches the owner live')

        # ---- promote to owner, then the last-owner rule
        owner.get_by_role('button', name='People', exact=True).first.click(); owner.wait_for_timeout(500)
        owner.locator('.access-row', has_text='Ana').get_by_role('button', name='Change').click(); owner.wait_for_timeout(200)
        owner.get_by_role('radio', name='Owner').click(); owner.get_by_role('button', name='Save').click(); owner.wait_for_timeout(1200)
        st, me2 = req('GET', '/api/me', atoken)
        check(me2['me']['role'] == 'owner', 'Ana promoted to owner')
        ana.get_by_role('button', name='People', exact=True).first.click(); ana.wait_for_timeout(800)
        check(ana.get_by_role('button', name='Invite someone').count() == 1, 'new owner can invite')
        st, ppl = req('GET', '/api/people', otoken)
        ana_id = [x for x in ppl['people'] if x['name'] == 'Ana'][0]['id']; maya_id = [x for x in ppl['people'] if x['name'] == 'Maya'][0]['id']
        req('PATCH', '/api/people/' + ana_id, otoken, {'role': 'editor'})
        st, r = req('PATCH', '/api/people/' + maya_id, otoken, {'role': 'viewer'})
        check(st == 400 and 'at least one owner' in r['message'], 'cannot remove the last owner')

        # ---- photos
        owner.get_by_role('button', name='Photos').first.click(); owner.wait_for_timeout(400)
        png = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000003010100c9fe92ef0000000049454e44ae426082')
        owner.set_input_files('input[type=file][accept="image/*"]', {'name': 'a.png', 'mimeType': 'image/png', 'buffer': png}); owner.wait_for_timeout(1800)
        check(owner.locator('.photo-grid.big .photo-thumb').count() == 1, 'photo uploaded')
        loaded = owner.evaluate("new Promise(r => { const i = document.querySelector('.photo-grid.big img'); if (i.complete) r(i.naturalWidth); else { i.onload = () => r(i.naturalWidth); i.onerror = () => r(-1); } })")
        check(loaded > 0, 'photo loads from the server')
        src = owner.locator('.photo-grid.big img').get_attribute('src')
        st, _ = req('GET', src.split('?')[0])
        check(st == 401, 'photo is private without a link')

        # ---- invite made for someone already in the family: they join with their own name, color and birthday
        st, _ = req('PUT', '/api/docs/members/kid1', otoken, {'data': {'name': 'Leah', 'role': 'child', 'avatar': '🦊', 'color': '#F6C28E', 'birthday': '2015-06-02'}})
        owner.get_by_role('button', name='People', exact=True).first.click(); owner.wait_for_timeout(500)
        owner.get_by_role('button', name='Invite someone').click(); owner.wait_for_timeout(300)
        check(owner.locator('.who-opt.on', has_text='Leah').count() == 1, 'invite picks a family member who is not invited yet')
        check(owner.locator('.who-opt', has_text='Maya').get_attribute('disabled') is not None, 'people who already have access cannot be picked')
        owner.locator('.sheet-foot').get_by_role('button', name='Create Leah’s link').click(); owner.wait_for_timeout(600)
        linv = owner.locator('.link-input').input_value()
        owner.locator('.sheet-foot').get_by_role('button', name='Close').click(); owner.wait_for_timeout(200)
        lctx, leah = mk({'width': 390, 'height': 800})
        leah.goto(linv); leah.wait_for_timeout(800)
        check(leah.locator('text=Hi Leah!').count() == 1 and leah.locator('input[placeholder="Your name"]').count() == 0, 'join page greets Leah, no name to type')
        leah.get_by_role('button', name='Join Santos family').click(); leah.wait_for_url('**/c/**'); leah.wait_for_timeout(1200)
        ltoken = leah.url.split('/c/')[1]
        st, lme = req('GET', '/api/me', ltoken)
        check(lme['me']['memberId'] == 'kid1' and lme['me']['name'] == 'Leah', 'Leah is linked to her family profile')
        st, r = req('PUT', '/api/me/profile', ltoken, {'avatar': '🐼', 'color': '#A8CDEA', 'birthday': '2015-06-03'})
        st, s3 = req('GET', '/api/state', otoken)
        k = [d for d in s3['docs']['members'] if d['id'] == 'kid1'][0]['data']
        check(k['avatar'] == '🐼' and k['birthday'] == '2015-06-03', 'a person can change their own icon and birthday')
        st, r = req('POST', '/api/me/member', atoken, {'memberId': 'kid1'})
        check(st == 400, 'nobody else can take a linked profile')
        lctx.close()

        # ---- month view shows the time before the name
        owner.get_by_role('button', name='Calendar').first.click(); owner.wait_for_timeout(300)
        owner.get_by_role('radio', name='Month').click(); owner.wait_for_timeout(300)
        check(owner.locator('.mv-ev', has_text='Soccer practice').locator('.mv-time').inner_text() in ('5PM', '17:00'), 'month view shows the time (5PM Soccer practice)')

        # ---- public holidays (from the stand-in list)
        owner.get_by_role('button', name='Holidays').click(); owner.wait_for_timeout(300)
        owner.fill('.sheet input[type=search]', 'BC holidays'); owner.locator('.sheet').get_by_role('button', name='Search').click(); owner.wait_for_timeout(1200)
        check(owner.locator('.sheet h3', has_text='Canada · British Columbia').count() == 1, '"BC holidays" finds British Columbia')
        check(owner.locator('.hol-src', has_text='official').count() == 1, 'dates come from the public holiday list')
        check(owner.locator('.gc-row', has_text='Boxing Day').count() == 0 and owner.locator('.gc-row', has_text='British Columbia Day').count() == 1, 'province holidays only (BC Day yes, Boxing Day no)')
        owner.locator('.sheet-foot button.primary').click(); owner.wait_for_timeout(1200)
        st, s4 = req('GET', '/api/state', otoken)
        hs = s4['docs'].get('holidays', [])
        sets = [d for d in s4['docs']['settings'] if d['id'] == 'main'][0]['data'].get('holidaySets', [])
        check(len(hs) == 11 and len(sets) == 1 and sets[0]['key'] == 'CA-BC', 'holidays saved for the whole family')

        # ---- Recipes: find a dish (AI), with the daily limit; then groceries grouped by the dish
        owner.get_by_role('button', name='Meals').first.click(); owner.wait_for_timeout(300)
        owner.get_by_role('radio', name='Recipes').click(); owner.wait_for_timeout(200)
        check(owner.get_by_role('radio', name='Shop').count() == 0, 'Shop tab is gone (it lives in Recipes now)')
        for i in range(3):
            owner.fill('#find-dish', 'adobo %d' % i)
            owner.get_by_role('button', name='Find recipe').click(); owner.wait_for_timeout(900)
            if i < 2: check(owner.locator('.found-ings .ing-pick').count() == 3, 'recipe comes back (%d)' % (i + 1))
        check(owner.locator('text=used all of today').count() == 1, 'daily AI limit message')
        owner.fill('#find-dish', 'adobo 1'); owner.get_by_role('button', name='Find recipe').click(); owner.wait_for_timeout(300)
        owner.evaluate("PL.store.add('recipes', {title: 'Chicken adobo', emoji: '🍗', servings: 4, ingredients: ['1 kg chicken', 'Soy sauce', 'Vinegar'], steps: 'Simmer.'})"); owner.wait_for_timeout(800)
        owner.locator('.recipe-card', has_text='Chicken adobo').get_by_role('button', name='Add to groceries').click(); owner.wait_for_timeout(300)
        check(owner.locator('.gc-row').count() == 3, 'grocery check list shows the ingredients')
        owner.locator('.gc-row', has_text='Vinegar').locator('input').uncheck()
        owner.locator('.sheet-foot').get_by_role('button', name='Add 2 items').click(); owner.wait_for_timeout(1000)
        check(owner.locator('.toast.show', has_text='Undo').count() == 1, 'added, with Undo')
        st, s5 = req('GET', '/api/state', otoken)
        items = [d['data'] for d in s5['docs'].get('listitems', [])]
        check(len(items) == 2 and all(i.get('group') == '🍗 · Chicken adobo' for i in items), 'groceries are saved under the dish name')

        # ---- Notes: a table with a total
        owner.get_by_role('button', name='Notes').first.click(); owner.wait_for_timeout(300)
        owner.get_by_role('button', name='New table').click(); owner.wait_for_timeout(800)
        owner.fill('input[data-r="0"][data-c="0"]', 'Lego'); owner.fill('input[data-r="0"][data-c="1"]', '$10.50'); owner.fill('input[data-r="1"][data-c="1"]', '$4.50')
        owner.wait_for_timeout(1300)
        check(owner.locator('.tbl tfoot', has_text='$15.00').count() == 1, 'number column adds up')
        st, s6 = req('GET', '/api/state', otoken)
        n = s6['docs'].get('notes', [])
        check(len(n) == 1 and n[0]['data']['rows'][0][0] == 'Lego', 'table saves by itself')

        # ---- another family cannot see this one
        st, other = req('POST', '/api/families', None, {'yourName': 'Zed', 'familyName': 'Other'})
        st, s2 = req('GET', '/api/state', other['token'])
        check(not any(d['data'].get('title') == 'Soccer practice' for d in s2['docs'].get('events', [])), 'families are kept apart')
        st, _ = req('GET', src.split('?')[0] + '?t=' + other['token'])
        check(st == 404, 'other family cannot open our photo')

        # ---- remove Ana: her page closes
        owner.get_by_role('button', name='People', exact=True).first.click(); owner.wait_for_timeout(500)
        owner.locator('.access-row', has_text='Ana').get_by_role('button', name='Change').click(); owner.wait_for_timeout(200)
        owner.get_by_role('button', name='Remove').click(); owner.wait_for_timeout(200)
        owner.get_by_role('button', name='Remove').last.click(); owner.wait_for_timeout(1500)
        check(ana.locator('text=This link does not work anymore').count() == 1, 'removed person is shown out, live')
        st, _ = req('GET', '/api/me', atoken)
        check(st == 401, 'removed link no longer works')

        # ---- start page remembers the family on this device
        owner.goto(BASE); owner.wait_for_timeout(500)
        check(owner.locator('.land-open', has_text='Santos family').count() == 1, 'start page lists your family')
        owner.locator('.land-open', has_text='Santos family').click(); owner.wait_for_url('**/c/**'); owner.wait_for_timeout(800)
        owner.screenshot(path='/home/claude/kal/dist/web-family.png', full_page=True)

        # ---- delete the family
        owner.get_by_role('button', name='People', exact=True).first.click(); owner.wait_for_timeout(500)
        owner.screenshot(path='/home/claude/kal/dist/web-access.png', full_page=True)
        owner.get_by_role('button', name='Delete this family').click(); owner.wait_for_timeout(200)
        owner.fill('input[placeholder=DELETE]', 'DELETE'); owner.get_by_role('button', name='Delete forever').click(); owner.wait_for_url(BASE + '/'); owner.wait_for_timeout(400)
        st, _ = req('GET', '/api/me', otoken)
        check(st == 401, 'deleted family links stop working')
        # ---- demo home: made-up family, nothing saved to the server; the logo goes to the start page
        dctx, demo = mk({'width': 1280, 'height': 900})
        demo.goto(BASE); demo.wait_for_timeout(500)
        demo.get_by_role('link', name='Try a demo home').click(); demo.wait_for_url('**/demo'); demo.wait_for_timeout(1500)
        check(demo.locator('.demo-banner', has_text='This is a demo home').count() == 1, 'demo home opens with its banner')
        check(demo.evaluate("PL.state.members.length") == 6 and demo.evaluate("PL.state.photos.length") == 20, 'demo family and 20 photos')
        check(demo.evaluate("PL.state.events.length") >= 20 and demo.evaluate("PL.state.holidays.length") >= 20 and demo.evaluate("PL.state.notes.length") == 6, 'about 3 months of plans, holidays and notes')
        check(demo.evaluate("PL.photos.url(PL.state.photos[0], 600)").startswith('https://images.unsplash.com/photo-'), 'demo photos come from Unsplash')
        demo.evaluate("PL.store.addEvent({title: 'Demo only', date: PL.D.today(), allDay: true, memberIds: []})"); demo.wait_for_timeout(500)
        check(demo.evaluate("PL.state.events.some(e => e.title === 'Demo only')"), 'changes work in the demo')
        demo.reload(); demo.wait_for_timeout(1500)
        check(not demo.evaluate("PL.state.events.some(e => e.title === 'Demo only')"), 'demo resets after reload (nothing saved)')
        demo.locator('.brand').click(); demo.wait_for_url(BASE + '/'); demo.wait_for_timeout(300)
        check(demo.url == BASE + '/', 'the logo goes back to the start page')
        dctx.close()

        check(not logs, 'no page errors ' + str(logs[:5]))
        b.close()
finally:
    hol.kill()
    srv.terminate()
    out = srv.communicate(timeout=5)[0]
    if errors or sys.exc_info()[0]: print(out[-3000:])
print('FAILED: %d' % len(errors) if errors else 'ALL PASSED')
sys.exit(1 if errors else 0)
