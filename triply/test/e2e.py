"""
e2e.py — drives the real page in a real browser, with two people at once.
  BASE=http://localhost:4100 python3 test/e2e.py     (shots go to SHOTS, default /tmp/shots)
"""
import os, re, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE', 'http://localhost:4100')
SHOTS = os.environ.get('SHOTS', '/tmp/shots')
os.makedirs(SHOTS, exist_ok=True)
problems = []

def watch(page, who):
    page.on('console', lambda m: problems.append(f'[{who}] console {m.type}: {m.text}') if m.type in ('error',) and 'fonts.g' not in m.text and 'ERR_' not in m.text else None)
    page.on('pageerror', lambda e: problems.append(f'[{who}] page error: {e}'))

def nav(page, name):
    # phones keep some screens behind "More"
    btn = page.get_by_role('button', name=name).first
    if btn.is_visible():
        btn.click()
    else:
        page.get_by_role('button', name='More').click()
        page.get_by_role('button', name=name).last.click()

def shot(page, name):
    page.screenshot(path=f'{SHOTS}/{name}.png', full_page=False)

def _dump(page):
    try: page.screenshot(path=f'{SHOTS}/FAIL.png')
    except Exception as e: print('shot failed', e)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctxA = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctxB = b.new_context(viewport={'width': 1280, 'height': 800})
    for c in (ctxA, ctxB):
        c.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    A = ctxA.new_page(); Bp = ctxB.new_page()
    watch(A, 'Maya'); watch(Bp, 'Leah')

    # ---- Maya makes a trip on his phone
    A.goto(BASE + '/')
    expect(A.get_by_role('heading', name='My Trips')).to_be_visible()
    shot(A, '01-empty')
    A.get_by_role('button', name=re.compile('New trip')).click()
    A.get_by_label('Trip name').fill('Spain & Mediterranean Cruise')
    A.get_by_label('Destination').fill('Spain')
    A.get_by_label('Route').fill('Vancouver → Madrid → Barcelona')
    A.get_by_label('Starts').fill('2027-07-23')
    A.get_by_label('Ends').fill('2027-08-05')
    A.get_by_label('Your name').fill('Maya')
    shot(A, '02-new-trip')
    A.get_by_role('button', name='Create trip').click()
    expect(A.get_by_role('heading', name='Spain & Mediterranean Cruise')).to_be_visible()
    expect(A.get_by_text('Your trip is ready')).to_be_visible()
    my_link = A.get_by_label('Your personal link').input_value()
    assert '/#/t/' in my_link, my_link
    shot(A, '03-link-sheet')
    A.get_by_role('button', name='Got it').click()
    shot(A, '04-overview')

    # ---- add plans
    def add_plan(page, kind, fill):
        page.get_by_role('button', name='Itinerary').first.click()
        page.get_by_role('button', name='Add', exact=True).first.click()
        page.get_by_role('button', name=kind, exact=True).click()
        fill(page)
        page.get_by_role('button', name='Add to trip').click()
        expect(page.get_by_text('Added to the trip.')).to_be_visible()

    def flight(pg):
        pg.get_by_label('Airline').fill('Air Canada'); pg.get_by_label('Flight number').fill('AC123')
        pg.get_by_label('From', exact=True).fill('Vancouver (YVR)'); pg.get_by_label('To', exact=True).fill('Montreal (YUL)')
        pg.get_by_label('Departs – day').fill('2027-07-23'); pg.get_by_label('Departs – day').locator('xpath=ancestor::div[contains(@class,"row2")]').get_by_label('Time').fill('07:00')
        pg.get_by_label('Arrives – day').fill('2027-07-23')
        pg.get_by_label('Confirmation number').fill('ABC123')
    add_plan(A, 'Flight', flight)

    def hotel(pg):
        pg.get_by_label('Name').first.fill('Hotel Madrid Gran Via')
        pg.get_by_label('Check-in – day').fill('2027-07-24'); pg.get_by_label('Check-out – day').fill('2027-07-27')
        pg.get_by_label('Address').fill('Gran Via 1, Madrid')
        pg.get_by_label('Confirmation number').fill('HM-7788')
    add_plan(A, 'Hotel', hotel)

    def dinner(pg):
        pg.get_by_label('Name').first.fill('Casa Lucio')
        pg.get_by_label('Reservation – day').fill('2027-07-25')
        pg.get_by_label('Reservation – day').locator('xpath=ancestor::div[contains(@class,"row2")]').get_by_label('Time').fill('19:30')
        pg.get_by_label('People').fill('4')
    add_plan(A, 'Restaurant', dinner)
    expect(A.get_by_text('Casa Lucio').first).to_be_visible()
    shot(A, '05-timeline')
    for v in ('Day', 'Week', 'Full trip'):
        A.get_by_role('radio', name=v).click(); shot(A, '06-' + v.replace(' ', '-').lower())
    A.get_by_role('radio', name='Timeline').click()

    # ---- invite Leah (editor)
    nav(A, 'People')
    A.get_by_label('Note to yourself').fill('Leah')
    A.get_by_role('button', name='Create invitation link').click()
    invite = A.get_by_label('Invitation link').input_value()
    assert '/#/join/' in invite, invite
    shot(A, '07-people')

    # ---- Leah joins on a desktop
    Bp.goto(invite)
    expect(Bp.get_by_text('You will join as editor')).to_be_visible()
    shot(Bp, '08-join')
    Bp.get_by_label('Your name').fill('Leah')
    Bp.get_by_role('button', name='Join the trip').click()
    expect(Bp.get_by_role('heading', name='Spain & Mediterranean Cruise')).to_be_visible()
    Bp.get_by_role('button', name='Got it').click()
    expect(Bp.get_by_text('Casa Lucio').first).to_be_visible()
    shot(Bp, '09-b-overview')
    # used link no longer works
    ctxC = b.new_context(); C = ctxC.new_page(); C.route('**/fonts.googleapis.com/**', lambda r: r.abort()); C.goto(invite)
    expect(C.get_by_text('already been used')).to_be_visible(); ctxC.close()

    # ---- chat, live both ways
    Bp.get_by_role('button', name='Chat').first.click()
    Bp.get_by_role('textbox', name='Message').fill('Should we book the 7:30 dinner at https://example.com/casa ? @Maya')
    Bp.get_by_role('button', name='Send message').click()
    A.get_by_role('button', name='Chat').first.click()
    expect(A.get_by_text('Should we book the 7:30 dinner')).to_be_visible()
    A.get_by_role('textbox', name='Message').fill('Yes! 🎉')
    A.get_by_role('button', name='Send message').click()
    expect(Bp.get_by_text('Yes!')).to_be_visible()
    shot(A, '10-chat-phone'); shot(Bp, '11-chat-desktop')

    # a plan added by Maya appears live for Leah (and in the chat as activity)
    A.get_by_role('button', name='Itinerary').first.click()
    A.get_by_role('button', name='Add', exact=True).first.click()
    A.get_by_role('button', name='Activity').click()
    A.get_by_label('Name').first.fill('Prado Museum tour')
    A.get_by_label('Starts – day').fill('2027-07-26')
    A.get_by_role('button', name='Add to trip').click()
    expect(Bp.get_by_text('added an activity')).to_be_visible(timeout=8000)

    # ---- private message + unread badge
    A.get_by_role('button', name='Chat').first.click()
    A.get_by_role('tab', name=re.compile('Leah')).click()
    A.get_by_role('textbox', name='Message').fill('Psst, surprise dinner?')
    A.get_by_role('button', name='Send message').click()
    Bp.get_by_role('button', name='Overview').first.click()
    expect(Bp.locator('.nav-badge').first).to_be_visible(timeout=8000)
    Bp.get_by_role('button', name='Chat').first.click()
    Bp.get_by_role('tab', name=re.compile('Maya')).click()
    expect(Bp.get_by_text('Psst, surprise dinner?')).to_be_visible()

    # ---- bookings + permissions
    nav(Bp, 'Bookings')
    expect(Bp.get_by_text('ABC123')).to_be_visible(); expect(Bp.get_by_text('HM-7788')).to_be_visible()
    shot(Bp, '12-bookings')
    nav(A, 'People')
    A.get_by_label('Role of Leah').select_option('viewer')
    Bp.get_by_role('button', name='Itinerary').first.click()
    expect(Bp.get_by_role('button', name='Add', exact=True)).to_have_count(0, timeout=8000)

    # ---- My Trips lists it, with role
    Bp.get_by_role('button', name='My Trips').first.click()
    expect(Bp.get_by_text('View only')).to_be_visible()
    shot(Bp, '13-b-mytrips')
    A.goto(BASE + '/#/'); expect(A.get_by_role('heading', name='My Trips')).to_be_visible()
    shot(A, '14-a-mytrips')

    # ---- personal link works on a fresh device
    ctxD = b.new_context(viewport={'width': 1280, 'height': 800}); D = ctxD.new_page(); D.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    D.goto(my_link)
    expect(D.get_by_role('heading', name='Spain & Mediterranean Cruise')).to_be_visible()
    assert '/t/' not in D.url, 'token should be removed from the address bar'
    shot(D, '15-desktop-overview')
    D.get_by_role('button', name='Itinerary').first.click(); shot(D, '16-desktop-itinerary')
    ctxD.close()
    b.close()

if problems:
    print('PROBLEMS:'); [print(' ', x) for x in problems]; sys.exit(1)
print('e2e ok')
