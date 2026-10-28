/*
 * demo-europe.js — the story for the live demo trip (/triply/demo). Loaded before tools/mock-api.js.
 * A made-up family of 11 (3 households) on 14 days in France and Italy: Paris, Nice, Florence, Rome.
 * The trip is in progress (today is day 9), so every screen has something: itinerary, bookings, costs and a budget,
 * packing, files, group chat with photos, and private messages.
 * All names, confirmation numbers and tickets are made up and marked DEMO. Hotels, tours and restaurants are real places.
 * Photos are free stock photos from Unsplash (Unsplash License), loaded from Unsplash.
 */
(function () {
  const U = (id) => 'https://images.unsplash.com/photo-' + id + '?auto=format&fit=crop&q=75&w=1600';

  // A tiny one-page PDF ("e-ticket"), made in the browser so the Files screen has real files to open.
  function pdf(lines) {
    const esc = (s) => String(s).replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7e]/g, '-');
    const text = ['BT /F1 20 Tf 50 780 Td (' + esc(lines[0]) + ') Tj ET'].concat(lines.slice(1).map((l, i) => 'BT /F1 12 Tf 50 ' + (740 - i * 22) + ' Td (' + esc(l) + ') Tj ET')).join('\n');
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + text.length + ' >>\nstream\n' + text + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let out = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const x = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
    const blob = new Blob([out], { type: 'application/pdf' });
    return { url: URL.createObjectURL(blob), size: blob.size };
  }

  function seed(H) {
    const { uid, tok, key, addDays } = H;
    const today = key(new Date());
    const s = addDays(today, -8), d = (n) => addDays(s, n);          // today is day 9 of 14
    const at = (n, hm) => { const [y, m, dd] = d(n).split('-').map(Number); const [hh, mi] = (hm || '12:00').split(':').map(Number); return new Date(y, m - 1, dd, hh, mi).toISOString(); };
    const t = { id: uid(), name: 'Paris, Nice, Florence & Rome', destination: 'France and Italy', route: ['Vancouver', 'Paris', 'Nice', 'Florence', 'Rome', 'Vancouver'],
      start_date: d(0), end_date: d(13), description: 'The big family trip! 14 days, 2 countries, 4 cities, 11 of us. Nana and Papa Ben’s 45th anniversary. 🎉',
      cover_emoji: '🗼', cover_color: '#A8CDEA', cover_blob: null, viewers_chat: true, budget: 75000, budget_currency: 'EUR', created_at: at(-90), updated_at: at(-2) };

    // The family: 3 households and the fun aunt
    const P = H.PALETTE;
    const mk = (name, avatar, color, role) => ({ id: uid(), trip_id: t.id, name, avatar, color, role, token: tok(), joined_at: at(-88), last_seen_at: at(8, '09:00') });
    const nana = mk('Nana Rosa', '🌻', P[2], 'owner'), papa = mk('Papa Ben', '🧢', P[5], 'editor');
    const maya = mk('Maya', '🌸', P[7], 'owner'), leo = mk('Leo', '🦁', P[5], 'editor'), leah = mk('Leah', '🦊', P[1], 'viewer'), theo = mk('Theo', '🚀', P[3], 'viewer');
    const carlos = mk('Carlos', '🐻', P[4], 'editor'), ana = mk('Ana', '🌺', P[0], 'editor'), sofia = mk('Sofia', '🦋', P[6], 'viewer'), mateo = mk('Mateo', '🐸', P[3], 'viewer');
    const isa = mk('Tita Isa', '✨', P[6], 'editor');
    const all = [nana, papa, maya, leo, leah, theo, carlos, ana, sofia, mateo, isa];
    const adults = [nana, papa, maya, leo, carlos, ana, isa];
    const ids = (arr) => arr.map((m) => m.id);

    // The plan, day by day
    const items = [];
    const it = (by, type, title, o) => { const x = Object.assign({ id: uid(), trip_id: t.id, type, title, start_date: null, start_time: null, end_date: null, end_time: null, location: '', confirmation: '', notes: '', data: {}, version: 1, created_by: by.id, updated_by: by.id, created_at: at(-80), updated_at: at(-20) }, o); items.push(x); return x; };
    const conf = (c) => 'DEMO-' + c;
    const fl1 = it(leo, 'flight', 'Vancouver (YVR) → Paris (CDG)', { start_date: d(0), start_time: '15:55', end_date: d(1), end_time: '10:30', confirmation: conf('AC4K7P'), notes: 'Overnight flight. Kids: pyjamas and tablets in the carry-on.', data: { airline: 'Air Canada', flightNo: 'AC 880', from: 'Vancouver (YVR)', to: 'Paris (CDG)', terminal: 'Main / 2A', seat: 'Rows 31–34' } });
    const tr1 = it(isa, 'car', 'Private van: CDG → hotel', { start_date: d(1), start_time: '11:30', end_date: d(1), end_time: '12:45', location: 'Paris CDG, Terminal 2A arrivals', confirmation: conf('VAN-301'), notes: 'Driver holds a sign: SANTOS FAMILY. 2 child seats booked.', data: { company: 'Paris Airport Transfers', vehicle: 'Mercedes Sprinter (12 seats)', dropoffLocation: 'Shangri-La Paris' } });
    const h1 = it(maya, 'hotel', 'Shangri-La Paris', { start_date: d(1), start_time: '15:00', end_date: d(4), end_time: '12:00', location: '10 Avenue d’Iéna, 75116 Paris', confirmation: conf('SLP-88213'), notes: 'Early check-in requested. Ask for connecting rooms on the same floor.', data: { room: '2 family suites + 2 Eiffel-view rooms', contact: '+33 1 53 67 19 98' } });
    it(leo, 'activity', 'Eiffel Tower summit', { start_date: d(1), start_time: '16:00', end_time: '18:00', location: 'Champ de Mars, Paris', confirmation: conf('EIF-5521'), data: { cost: 418, currency: 'EUR' }, notes: 'Timed tickets. Lift to the top. Papa Ben stays on floor 2.' });
    it(carlos, 'restaurant', 'Le Relais de l’Entrecôte', { start_date: d(1), start_time: '19:30', location: '20 Rue Saint-Benoît, Paris', notes: 'No bookings, we go early. Steak-frites only, kids love it.', data: { people: 11 } });
    it(carlos, 'activity', 'Big Bus hop-on hop-off tour', { start_date: d(2), start_time: '09:30', end_time: '13:00', location: 'Stop 1: Champ de Mars', confirmation: conf('BIG-7781'), data: { cost: 539, currency: 'EUR' }, notes: '1-day Classic tickets. Get off at the Louvre stop.' });
    it(maya, 'activity', 'Louvre guided family tour', { start_date: d(2), start_time: '14:00', end_time: '16:30', location: 'Musée du Louvre, Pyramid entrance', confirmation: conf('LVR-2290'), data: { cost: 990, currency: 'EUR' }, notes: 'Skip-the-line. Guide: Camille. Mona Lisa first, then the Egyptian rooms for the kids.' });
    it(isa, 'activity', 'Seine dinner cruise', { start_date: d(2), start_time: '20:30', end_time: '23:00', location: 'Port de la Bourdonnais, Paris', confirmation: conf('SEINE-412'), data: { cost: 1650, currency: 'EUR' }, notes: 'Window tables. Smart casual.' });
    it(ana, 'activity', 'Versailles day trip by coach', { start_date: d(3), start_time: '08:30', end_time: '17:00', location: 'Pick-up: hotel lobby', confirmation: conf('VRS-0931'), data: { cost: 1155, currency: 'EUR' }, notes: 'Palace, Hall of Mirrors and gardens. Golf cart in the gardens for Nana.' });
    it(nana, 'place', 'Jardin du Luxembourg carousel', { start_date: d(3), start_time: '10:00', end_time: '12:00', location: 'Jardin du Luxembourg, Paris', notes: 'Nana, Papa Ben and the little ones skip Versailles: carousel, puppet show and crêpes.' });
    it(papa, 'restaurant', 'Bouillon Chartier', { start_date: d(3), start_time: '19:00', location: '7 Rue du Faubourg Montmartre, Paris', notes: 'Old Paris dining hall. Big queue, fast tables.', data: { people: 11 } });
    it(maya, 'car', 'TGV fast train: Paris → Nice', { start_date: d(4), start_time: '10:15', end_date: d(4), end_time: '16:05', location: 'Paris Gare de Lyon', confirmation: conf('SNCF-6610'), notes: 'Coach 14, seats 41–51. Bring lunch from the station.', data: { company: 'SNCF TGV inOui', vehicle: 'Train, 1st class', dropoffLocation: 'Nice-Ville station' } });
    it(isa, 'car', 'Taxi vans: Nice station → hotel', { start_date: d(4), start_time: '16:20', end_date: d(4), end_time: '16:45', location: 'Nice-Ville station', data: { company: 'Riviera Taxis', vehicle: '2 vans', dropoffLocation: 'Hotel Negresco' } });
    const h2 = it(ana, 'hotel', 'Hotel Negresco', { start_date: d(4), start_time: '16:00', end_date: d(7), end_time: '11:00', location: '37 Promenade des Anglais, Nice', confirmation: conf('NGR-55102'), notes: 'Sea-view rooms. Breakfast included.', data: { room: '2 family rooms + 2 sea-view doubles', contact: '+33 4 93 16 64 00' } });
    it(leo, 'restaurant', 'Lou Pilha Leva', { start_date: d(4), start_time: '19:00', location: '10 Rue du Collet, Nice', notes: 'Socca and pissaladière on the street. Easy first night.', data: { people: 11 } });
    it(nana, 'place', 'Cours Saleya flower market', { start_date: d(5), start_time: '09:00', end_time: '11:00', location: 'Cours Saleya, Old Nice', notes: 'Flowers, fruit and lavender soap for gifts.' });
    it(leo, 'activity', 'Beach club afternoon', { start_date: d(5), start_time: '13:00', end_time: '18:00', location: 'Beau Rivage beach, Nice', confirmation: conf('BEACH-17'), data: { cost: 380, currency: 'EUR' }, notes: '6 loungers and 2 umbrellas.' });
    it(carlos, 'restaurant', 'La Petite Maison', { start_date: d(5), start_time: '20:00', location: '11 Rue Saint-François de Paule, Nice', confirmation: conf('LPM-2041'), notes: 'Famous for the truffle pizza and the chicken. Booked 2 months ahead!', data: { people: 11 } });
    it(maya, 'activity', 'Èze & Monaco day tour', { start_date: d(6), start_time: '08:45', end_time: '18:00', location: 'Pick-up: Hotel Negresco', confirmation: conf('EZM-7710'), data: { cost: 1320, currency: 'EUR' }, notes: 'Minibus for 11. Èze village, perfume factory, Monaco palace and the casino square.' });
    it(ana, 'restaurant', 'Café de Paris Monte-Carlo', { start_date: d(6), start_time: '12:30', location: 'Place du Casino, Monaco', confirmation: conf('CDP-338'), data: { people: 11 } });
    it(leo, 'car', 'Private coach: Nice → Florence', { start_date: d(7), start_time: '09:00', end_date: d(7), end_time: '17:30', location: 'Hotel Negresco', confirmation: conf('COACH-845'), notes: 'Lunch stop in Portofino (2 hours).', data: { company: 'Riviera Coaches', vehicle: 'Mini coach, 16 seats', dropoffLocation: 'Portrait Firenze' } });
    const h3 = it(maya, 'hotel', 'Portrait Firenze', { start_date: d(7), start_time: '17:30', end_date: d(10), end_time: '11:00', location: 'Lungarno Acciaiuoli 4, Florence', confirmation: conf('PTF-30551'), notes: 'Suites right next to the Ponte Vecchio.', data: { room: '2 family suites + 2 river-view suites', contact: '+39 055 2726 8000' } });
    it(isa, 'restaurant', 'Buca Mario', { start_date: d(7), start_time: '20:00', location: 'Piazza degli Ottaviani 16r, Florence', confirmation: conf('BUCA-118'), data: { people: 11 }, notes: 'Bistecca alla fiorentina for the table.' });
    it(ana, 'activity', 'Uffizi Gallery guided tour', { start_date: d(8), start_time: '09:00', end_time: '11:30', location: 'Piazzale degli Uffizi, Florence', confirmation: conf('UFZ-6401'), data: { cost: 880, currency: 'EUR' }, notes: 'Botticelli’s Birth of Venus. Meet the guide at the gate 1 sign.' });
    it(carlos, 'activity', 'Duomo dome climb', { start_date: d(8), start_time: '14:00', end_time: '15:30', location: 'Piazza del Duomo, Florence', confirmation: conf('DUO-2211'), data: { cost: 120, currency: 'EUR' }, notes: '463 steps! Carlos, Maya, Tita Isa, Leah and Sofia.' });
    it(maya, 'activity', 'Gelato making class (kids)', { start_date: d(8), start_time: '16:30', end_time: '18:00', location: 'Via dei Neri, Florence', confirmation: conf('GEL-099'), data: { cost: 180, currency: 'EUR' }, notes: 'Leah, Theo, Sofia and Mateo. Aprons included.' });
    it(leo, 'restaurant', 'Trattoria ZaZà', { start_date: d(8), start_time: '19:30', location: 'Piazza del Mercato Centrale 26r, Florence', confirmation: conf('ZAZA-560'), data: { people: 11 } });
    it(leo, 'activity', 'Chianti wine country bus tour', { start_date: d(9), start_time: '09:00', end_time: '17:30', location: 'Pick-up: Piazza della Stazione', confirmation: conf('CHI-4802'), data: { cost: 945, currency: 'EUR' }, notes: '2 wineries and lunch in Greve. Maya, Leo, Carlos, Ana and Tita Isa.' });
    it(papa, 'place', 'Boboli Gardens with the kids', { start_date: d(9), start_time: '10:00', end_time: '13:00', location: 'Palazzo Pitti, Florence', notes: 'Nana and Papa Ben take the 4 kids. Picnic on the hill.' });
    it(papa, 'restaurant', 'Papa Ben’s anniversary dinner 🎉', { start_date: d(9), start_time: '20:00', location: 'Ristorante La Giostra, Borgo Pinti 12r, Florence', confirmation: conf('GIO-4545'), notes: 'Nana and Papa Ben’s 45th! Papa Ben is treating everyone. Shh, there is a cake.', data: { people: 11 } });
    it(carlos, 'car', 'Frecciarossa fast train: Florence → Rome', { start_date: d(10), start_time: '10:30', end_date: d(10), end_time: '12:05', location: 'Firenze Santa Maria Novella', confirmation: conf('TI-77120'), data: { company: 'Trenitalia Frecciarossa', vehicle: 'Train, Business class', dropoffLocation: 'Roma Termini' } });
    const h4 = it(leo, 'hotel', 'Hotel de Russie', { start_date: d(10), start_time: '14:00', end_date: d(13), end_time: '07:30', location: 'Via del Babuino 9, Rome', confirmation: conf('HDR-91220'), notes: 'Garden-view rooms. Pool for the kids.', data: { room: '2 family suites + 2 garden rooms', contact: '+39 06 328 881' } });
    it(isa, 'place', 'Trevi Fountain & Spanish Steps walk', { start_date: d(10), start_time: '18:30', end_time: '20:00', location: 'Piazza di Trevi, Rome', notes: 'Bring coins! One coin = you come back to Rome.' });
    it(maya, 'restaurant', 'Roscioli', { start_date: d(10), start_time: '20:30', location: 'Via dei Giubbonari 21, Rome', confirmation: conf('ROS-3307'), data: { people: 11 }, notes: 'The carbonara!' });
    it(leo, 'activity', 'Colosseum & Roman Forum guided tour', { start_date: d(11), start_time: '09:00', end_time: '12:00', location: 'Piazza del Colosseo, Rome', confirmation: conf('COL-5560'), data: { cost: 1100, currency: 'EUR' }, notes: 'Arena floor access. Hats and water.' });
    it(ana, 'restaurant', 'Pizzeria da Baffetto', { start_date: d(11), start_time: '19:30', location: 'Via del Governo Vecchio 114, Rome', data: { people: 11 } });
    it(carlos, 'activity', 'Vatican Museums early entry', { start_date: d(12), start_time: '07:30', end_time: '11:00', location: 'Viale Vaticano, Rome', confirmation: conf('VAT-8814'), data: { cost: 1430, currency: 'EUR' }, notes: 'Before the crowds! Sistine Chapel and St. Peter’s. Shoulders and knees covered.' });
    it(isa, 'restaurant', 'Farewell dinner: Ristorante Pierluigi', { start_date: d(12), start_time: '20:00', location: 'Piazza de’ Ricci 144, Rome', confirmation: conf('PIE-2208'), data: { people: 11 } });
    it(leo, 'car', 'Private vans: hotel → FCO airport', { start_date: d(13), start_time: '07:45', end_date: d(13), end_time: '08:45', location: 'Hotel de Russie', confirmation: conf('VAN-913'), data: { company: 'Rome Airport Transfers', vehicle: '2 Mercedes vans', dropoffLocation: 'Rome Fiumicino (FCO), Terminal 3' } });
    it(leo, 'flight', 'Rome (FCO) → Toronto (YYZ)', { start_date: d(13), start_time: '11:35', end_date: d(13), end_time: '15:20', confirmation: conf('AC4K7P'), data: { airline: 'Air Canada', flightNo: 'AC 891', from: 'Rome (FCO)', to: 'Toronto (YYZ)', terminal: '3', seat: 'Rows 28–31' } });
    it(leo, 'flight', 'Toronto (YYZ) → Vancouver (YVR)', { start_date: d(13), start_time: '18:00', end_date: d(13), end_time: '20:15', confirmation: conf('AC4K7P'), notes: 'Home! 1 h 40 min to connect in Toronto.', data: { airline: 'Air Canada', flightNo: 'AC 125', from: 'Toronto (YYZ)', to: 'Vancouver (YVR)', terminal: '1' } });
    it(maya, 'note', 'Before we go', { notes: 'Travel insurance for all 11 (done ✓)\nCheck if Europe’s new ETIAS travel permit is needed for our dates\neSIMs for the adults’ phones\nSome euros in cash for tips and gelato\nPlug adapters: France type E, Italy type L\nCall the bank about using our cards abroad' });
    it(ana, 'place', 'Shakespeare and Company bookshop', { location: '37 Rue de la Bûcherie, Paris', notes: 'For Leah and Sofia, if we have time.' });
    it(isa, 'place', 'Giolitti gelato', { location: 'Via degli Uffici del Vicario 40, Rome', notes: 'The famous one. Tita Isa’s treat!' });

    // Photos and files (blobs). Photos are Unsplash links; files are tiny made-up PDFs.
    const blobs = {};
    const photo = (by, id, credit, place, n, hm) => { const b = { id: uid(), trip_id: t.id, mime: 'image/jpeg', name: place + ' (photo: ' + credit + ' / Unsplash).jpg', size: 380000, created_by: by.id, created_at: at(n, hm), url: U(id) }; blobs[b.id] = b; return b; };
    const cover = photo(maya, '1642947392578-b37fbd9a4d45', 'Fabien Maurin', 'Eiffel Tower at sunset', -60, '20:00');
    t.cover_blob = cover.id;
    const file = (by, name, lines, n) => { const f = pdf(lines); const b = { id: uid(), trip_id: t.id, mime: 'application/pdf', name, size: f.size, created_by: by.id, created_at: at(n, '10:00'), url: f.url }; blobs[b.id] = b; return b; };
    const f1 = file(maya, 'TGV tickets Paris-Nice (DEMO).pdf', ['TGV e-ticket - DEMO', 'Paris Gare de Lyon -> Nice-Ville', 'Day 5, 10:15 - 16:05, Coach 14, seats 41-51', '11 travellers - Santos family', 'Booking DEMO-SNCF-6610', 'This is a made-up ticket for the Triply demo.'], -40);
    const f2 = file(carlos, 'Vatican early entry (DEMO).pdf', ['Vatican Museums - early entry - DEMO', 'Day 13, 07:30, 11 people', 'Dress code: shoulders and knees covered', 'Booking DEMO-VAT-8814', 'This is a made-up ticket for the Triply demo.'], -35);
    const f3 = file(ana, 'Travel insurance summary (DEMO).pdf', ['Travel insurance - DEMO', 'Family plan, 11 travellers, 14 days', 'Emergency line: see your policy', 'Policy DEMO-TI-2026-0091', 'This is a made-up document for the Triply demo.'], -30);

    // Chat: the family group, with photos, and a few private messages
    const messages = [];
    let seq = 0;
    const msg = (by, n, hm, body, o) => { messages.push(Object.assign({ id: String(++seq), trip_id: t.id, sender_id: by.id, to_member: null, kind: 'text', body: body || '', mentions: [], blob: null, item_id: null, meta: {}, created_at: at(n, hm) }, o || {})); };
    const pic = (by, n, hm, body, b) => msg(by, n, hm, body, { blob: { id: b.id, mime: b.mime, name: b.name, size: b.size } });
    const dm = (by, to, n, hm, body) => msg(by, n, hm, body, { to_member: to.id });
    const added = (by, n, item) => msg(by, n, '10:00', '', { kind: 'activity', item_id: item.id, meta: { event: 'added', type: item.type, title: item.title, date: item.start_date } });
    msg(nana, -88, '19:00', 'Okay family, it is happening!! 🇫🇷🇮🇹 14 days for our 45th. I made this trip so we can plan together. 💛');
    msg(isa, -88, '19:04', 'AHHH I’m in!! Tita Isa is ready 😎');
    added(maya, -80, h1);
    msg(maya, -80, '20:12', 'Booked the Shangri-La in Paris. Eiffel Tower view from 2 of the rooms 😍');
    msg(carlos, -79, '08:30', 'Amazing. We take one of the family suites. @Leo want to do the Big Bus on day 3?', { mentions: [leo.id] });
    msg(leo, -79, '09:02', 'Yes! Adding it now.');
    msg(ana, -60, '21:40', 'Booked La Petite Maison in Nice for 11 people. Two months ahead, phew 😅');
    msg(papa, -45, '18:15', 'I don’t need to do anything right? Just show up? 😂');
    msg(nana, -45, '18:16', 'You need to pack, Ben. 🙄');
    pic(maya, -40, '10:05', 'TGV tickets for Paris → Nice are in Files. Everyone in coach 14!', f1);
    msg(isa, -2 - 6, '06:00', 'Who has the plug adapters?? 🔌');
    msg(leo, -2 - 6, '06:03', 'Me. 6 of them. Relax 😂');
    msg(maya, 0, '13:10', 'At YVR, gate D52. Kids already asking about snacks 🥨');
    pic(leo, 1, '18:40', 'View from the top! Papa Ben made it to floor 2 and waved at us 👋', photo(leo, '1610046226394-be65aabee26d', 'Diogo Fagundes', 'Eiffel Tower', 1, '18:35'));
    pic(isa, 1, '22:15', 'Paris at night from our room. I’m never leaving.', photo(isa, '1632168594270-831d770aa8c3', 'Christopher Izquierdo', 'Paris at dusk', 1, '22:10'));
    pic(maya, 2, '16:40', 'Louvre done! Theo’s review: “the mummies were the best” 🏺', photo(maya, '1586168078184-1fe44f2491e1', 'slice', 'The Louvre', 2, '16:35'));
    pic(carlos, 2, '22:30', 'Seine dinner cruise 🚢✨', photo(carlos, '1755817073913-deecc151b211', 'Andreas Weilguny', 'The Seine', 2, '22:25'));
    msg(papa, 3, '11:20', 'Carousel report: Mateo rode it 6 times. Nana got crêpes everywhere. 10/10.');
    pic(ana, 3, '15:05', 'Hall of Mirrors and the gardens 😮', photo(ana, '1649878144828-6bce23f2affd', 'Andri Klopfenstein', 'Versailles', 3, '15:00'));
    msg(isa, 3, '21:50', 'Papa Ben fell asleep on the coach back from Versailles 😂😂');
    msg(papa, 3, '21:52', 'I was resting my eyes.');
    pic(leo, 4, '17:30', 'Nice!! (the city AND the view) 🌊', photo(leo, '1532366011931-2b677cf69bea', 'Hans Reniers', 'Promenade des Anglais', 4, '17:25'));
    pic(nana, 5, '15:10', 'Beach day. The kids won’t get out of the water.', photo(nana, '1547768126-7baafccffdd8', 'Daniel van den Berg', 'Nice beach', 5, '15:05'));
    msg(carlos, 5, '23:05', 'La Petite Maison was the best meal of my life. That chicken!! 🍗');
    pic(maya, 6, '11:45', 'Èze from the top 😍', photo(maya, '1549862860-f8cf6f30a153', 'jennieramida', 'Èze', 6, '11:40'));
    pic(ana, 6, '15:30', 'Monaco harbour. Leo is picking his boat. 🛥️', photo(ana, '1561768789-ad8f2d165ba0', 'Michelle Woodson Howell', 'Monte Carlo harbour', 6, '15:25'));
    pic(isa, 7, '13:20', 'Lunch stop in Portofino. Can we just live here?', photo(isa, '1590141302903-3f6f3631b53f', 'Belinda Fewings', 'Portofino', 7, '13:15'));
    pic(leo, 7, '19:10', 'Our window in Florence. Ponte Vecchio right there.', photo(leo, '1687817996640-d4ab7ecf186c', 'Joseph Quam', 'Ponte Vecchio', 7, '19:05'));
    msg(maya, 8, '08:20', 'Good morning Florence! Uffizi at 9, meet in the lobby at 8:40 please 🙏 @Tita Isa that means you 😂', { mentions: [isa.id] });
    msg(isa, 8, '08:22', 'I’m already in the lobby with a cappuccino, excuse you ☕');
    pic(ana, 8, '11:50', 'Birth of Venus ✔️ Now the Duomo!', photo(ana, '1751147449909-174ce44667b6', 'Thibault Lam Tran', 'Florence Duomo', 8, '11:45'));
    msg(papa, 8, '12:30', 'Quick vote for tomorrow night: I booked La Giostra for our anniversary. Everyone in? 👍', {});
    msg(leo, 8, '12:31', '👍'); msg(carlos, 8, '12:31', '👍👍'); msg(isa, 8, '12:33', 'Obviously 👍');
    pic(maya, 8, '13:05', 'Gelato research for the kids’ class this afternoon 🍦', photo(maya, '1648971413826-8377e3c65039', 'hai_gea', 'Gelato', 8, '13:00'));
    // Private messages
    dm(isa, maya, -20, '21:00', 'Psst. I ordered a cake for Nana and Papa’s anniversary dinner. Don’t tell them! 🎂');
    dm(maya, isa, -20, '21:03', 'You’re the best. I’ll ask the restaurant to bring it after dinner.');
    dm(leo, carlos, 6, '22:40', 'Golf in Rome on day 12 morning? Before the farewell dinner?');
    dm(carlos, leo, 6, '22:44', 'Ana says only if we’re back by 2 😂');
    dm(isa, maya, 8, '12:40', 'Can I take Leah and Sofia shopping tomorrow while you do the wine tour?');
    const reads = {}; reads[maya.id] = { trip: String(seq - 6) };

    // Costs: flights in CAD, everything in Europe in EUR. Each family pays its own rooms; shared things are split.
    const expenses = {};
    const ex = (title, amount, cur, payer, split, n, item, note) => { const e = { id: uid(), trip_id: t.id, title, amount, currency: cur, paid_by: payer.id, split: ids(split), spent_on: d(n), item_id: item ? item.id : null, note: note || '', created_by: payer.id, created_at: at(n, '12:00') }; expenses[e.id] = e; };
    const fam = { maya: [maya, leo], carlos: [carlos, ana], nana: [nana, papa], isa: [isa] };
    ex('Flights: Maya, Leo, Leah & Theo', 7840, 'CAD', leo, fam.maya, -85, fl1);
    ex('Flights: Carlos, Ana, Sofia & Mateo', 7840, 'CAD', carlos, fam.carlos, -85, fl1);
    ex('Flights: Nana Rosa & Papa Ben', 3920, 'CAD', papa, fam.nana, -85, fl1);
    ex('Flight: Tita Isa', 1960, 'CAD', isa, fam.isa, -85, fl1);
    [[h1, 4650, 2850, 2100, -80], [h2, 2400, 1500, 1050, -70], [h3, 2700, 1800, 1200, -65], [h4, 3600, 2400, 1650, -60]].forEach(([h, fam4, two, one, n]) => {
      ex(h.title + ': family suite (Maya & Leo)', fam4, 'EUR', maya, fam.maya, n, h);
      ex(h.title + ': family suite (Carlos & Ana)', fam4, 'EUR', ana, fam.carlos, n, h);
      ex(h.title + ': room (Nana & Papa Ben)', two, 'EUR', nana, fam.nana, n, h);
      ex(h.title + ': room (Tita Isa)', one, 'EUR', isa, fam.isa, n, h);
    });
    const byTitle = (x) => items.find((i) => i.title === x);
    ex('Airport van in Paris', 280, 'EUR', leo, adults, 1, tr1);
    ex('Eiffel Tower summit tickets', 418, 'EUR', leo, adults, -30, byTitle('Eiffel Tower summit'));
    ex('Le Relais de l’Entrecôte', 495, 'EUR', carlos, adults, 1, byTitle('Le Relais de l’Entrecôte'));
    ex('Big Bus tickets (11)', 539, 'EUR', carlos, adults, -28, byTitle('Big Bus hop-on hop-off tour'));
    ex('Louvre guided tour', 990, 'EUR', maya, adults, -50, byTitle('Louvre guided family tour'));
    ex('Seine dinner cruise', 1650, 'EUR', isa, adults, -45, byTitle('Seine dinner cruise'));
    ex('Versailles coach tour', 1155, 'EUR', ana, adults, -44, byTitle('Versailles day trip by coach'));
    ex('Crêpes and carousel tickets', 64, 'EUR', papa, fam.nana, 3);
    ex('Bouillon Chartier', 310, 'EUR', papa, adults, 3, byTitle('Bouillon Chartier'));
    ex('TGV tickets Paris → Nice (11)', 1045, 'EUR', maya, adults, -40, byTitle('TGV fast train: Paris → Nice'));
    ex('Taxi vans in Nice', 160, 'EUR', isa, adults, 4);
    ex('Lou Pilha Leva', 142, 'EUR', leo, adults, 4, byTitle('Lou Pilha Leva'));
    ex('Beach club loungers', 380, 'EUR', leo, adults, 5, byTitle('Beach club afternoon'));
    ex('La Petite Maison', 1240, 'EUR', carlos, adults, 5, byTitle('La Petite Maison'));
    ex('Èze & Monaco tour', 1320, 'EUR', maya, adults, -38, byTitle('Èze & Monaco day tour'));
    ex('Café de Paris lunch', 690, 'EUR', ana, adults, 6, byTitle('Café de Paris Monte-Carlo'));
    ex('Perfume from Èze', 85, 'EUR', nana, [nana], 6, null, 'For Nana, from Papa Ben. Shh.');
    ex('Private coach to Florence', 1450, 'EUR', leo, adults, -36, byTitle('Private coach: Nice → Florence'));
    ex('Lunch in Portofino', 410, 'EUR', isa, adults, 7);
    ex('Buca Mario', 720, 'EUR', isa, adults, 7, byTitle('Buca Mario'));
    ex('Uffizi tour', 880, 'EUR', ana, adults, -33, byTitle('Uffizi Gallery guided tour'));
    ex('Duomo climb tickets', 120, 'EUR', carlos, [carlos, maya, isa], -20, byTitle('Duomo dome climb'));
    ex('Gelato class (4 kids)', 180, 'EUR', maya, [maya, leo, carlos, ana], -20, byTitle('Gelato making class (kids)'));
    ex('Gelato. A lot of gelato.', 96, 'EUR', papa, adults, 8);
    ex('Chianti wine tour (5)', 945, 'EUR', leo, [maya, leo, carlos, ana, isa], -25, byTitle('Chianti wine country bus tour'));
    ex('Frecciarossa tickets (11)', 660, 'EUR', carlos, adults, -24, byTitle('Frecciarossa fast train: Florence → Rome'));
    ex('Colosseum tour', 1100, 'EUR', leo, adults, -22, byTitle('Colosseum & Roman Forum guided tour'));
    ex('Vatican early entry', 1430, 'EUR', carlos, adults, -21, byTitle('Vatican Museums early entry'), 'Tickets are in Files.');
    ex('Anniversary cake (secret!)', 75, 'EUR', isa, [isa, maya], -20, null, 'Do not show Nana 🤫');
    ex('Travel insurance (family plan)', 1290, 'CAD', maya, adults, -50, null, 'Policy in Files.');

    // Packing: shared, mostly done (we are on the trip)
    const packing = {};
    const pk = (title, category, who, done, by) => { const x = { id: uid(), trip_id: t.id, title, category, assigned_to: who ? who.id : null, done: !!done, done_by: done ? (who || by || maya).id : null, created_by: (by || maya).id, created_at: at(-30, '20:00') }; packing[x.id] = x; };
    pk('Passports (all 11)', 'Documents', maya, true); pk('Printed hotel and tour bookings', 'Documents', ana, true); pk('Travel insurance cards', 'Documents', maya, true); pk('Kids’ birth certificates (copies)', 'Documents', carlos, true);
    pk('Plug adapters (6)', 'Tech', leo, true); pk('Power bank', 'Tech', isa, true); pk('Kids’ tablets and headphones', 'Tech', leo, true); pk('eSIMs installed', 'Tech', carlos, true);
    pk('Comfy walking shoes', 'Clothes', null, true); pk('Light rain jackets', 'Clothes', null, true); pk('Church outfits (shoulders covered)', 'Clothes', nana, true); pk('Swimsuits', 'Clothes', ana, true); pk('Nice dress for the anniversary dinner', 'Clothes', nana, true);
    pk('Sunscreen', 'Toiletries', ana, true); pk('Travel toothpaste', 'Toiletries', null, true);
    pk('First-aid kit', 'Health', ana, true); pk('Papa Ben’s medicine (14 days)', 'Health', papa, true); pk('Motion sickness tablets for the coach', 'Health', maya, false);
    pk('Snacks for the flight', 'Other', isa, true); pk('Euro coins for Trevi Fountain', 'Other', isa, false); pk('Gift for Nana and Papa (anniversary)', 'Other', isa, true); pk('Empty suitcase for shopping 😅', 'Other', isa, false);

    const members = {}; all.forEach((m) => { members[m.id] = m; });
    const db = { trips: { [t.id]: t }, members, items: Object.fromEntries(items.map((x) => [x.id, x])), messages, invites: {}, reads, blobs, expenses, packing, seq };
    void f2; void f3;
    try { localStorage.setItem('tr.seen.' + t.id, JSON.stringify(at(7, '21:00'))); } catch (e) { /* the Updates page shows only what is new since last night */ }
    return { db, token: maya.token, tripId: t.id };
  }

  window.TRIPLY_DEMO = {
    seed,
    bot: 'Tita Isa',
    banner: { text: 'This is a demo trip. Try anything, changes are not saved.', link: 'Plan your own trip', href: '/' }
  };
})();
