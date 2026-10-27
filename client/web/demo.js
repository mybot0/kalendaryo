/*
 * demo.js — web version only. The demo home at /demo: a made-up family (the Santos family) with about
 * 3 months of plans. Anyone can try it. Nothing is sent to the server: changes stay in this browser tab
 * and are gone when the page is closed or reloaded (shim.js keeps the demo data in memory).
 * Photos are free stock photos from Unsplash (Unsplash License), loaded from Unsplash.
 * Also here: the Kalendaryo logo (top left) goes back to the start page.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const D = PL.D;

  /* ---------- 20 free photos from Unsplash (Unsplash License), in the style of a home display ---------- */
  const U = (id) => 'https://images.unsplash.com/photo-' + id + '?auto=format&fit=crop&q=75';
  const PHOTOS = [
    ['1464852045489-bccb7d17fe39', 'fynn'],                 // snowy mountain and lake
    ['1558373355-fd545fa670f2', 'Nicola Dreyer'],           // dog on the sofa
    ['1584358838337-8f86d1b3922e', 'Simon Marsault'],       // waves at sunset
    ['1543168691-518c24c546ea', 'Maddi Bazzocco'],          // pancakes
    ['1762780187965-c414bde372a5', 'Andrey Tikhonovskiy'],  // autumn forest path
    ['1559074070-e6a37115631e', 'Alex MacFaul'],            // cat in the sun
    ['1689788647851-3203de944519', 'Isakov Eldiiar'],       // lake at sunset
    ['1652169892293-ba174ef19931', 'Svitlana'],             // picnic in the garden
    ['1764253681216-f8881c959a28', 'Christopher Politano'], // snowy cabin
    ['1660621776119-498c0884e334', 'Katherine St-Pierre'],  // campfire
    ['1687710071600-2c338cea1592', 'snap shoot'],           // tulip field
    ['1574372623190-ee1fa4423f7f', 'Alisa Anton'],          // hot chocolate
    ['1768279941928-d98d50cb132a', 'Gennady Zakharin'],     // city lights on the water
    ['1585815301724-5457735c7a74', 'Daniele Salutari'],     // golden retriever
    ['1760891140887-7f8966fae6e7', 'Clark Wilson'],         // autumn trees
    ['1553135422-400ee5852b27', 'Isabella Fischer'],        // birthday cupcake
    ['1682613375621-c10d167c852e', 'Jake Nackos'],          // mountains at sunset
    ['1621460248083-6271cc4437a8', 'Jonathan Kemper'],      // planting the garden
    ['1735896951413-cb764374f75a', 'Joshua Earle'],         // road trip
    ['1657444984080-5c08464bde8c', 'Bro Takes Photos']      // running on the beach
  ];

  /* ---------- BC holidays, worked out for any year ---------- */
  function easter(y) { // Gregorian Easter Sunday
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  const nthMonday = (y, mo, n) => { const d = new Date(y, mo, 1); const first = 1 + ((8 - d.getDay()) % 7); return new Date(y, mo, first + 7 * (n - 1)); };
  function bcHolidays(y) {
    const k = (d) => D.key(d);
    const gf = easter(y); gf.setDate(gf.getDate() - 2);
    const v = new Date(y, 4, 24); while (v.getDay() !== 1) v.setDate(v.getDate() - 1); // the Monday before May 25
    return [[y + '-01-01', 'New Year’s Day'], [k(nthMonday(y, 1, 3)), 'Family Day'], [k(gf), 'Good Friday'], [k(v), 'Victoria Day'], [y + '-07-01', 'Canada Day'],
      [k(nthMonday(y, 7, 1)), 'B.C. Day'], [k(nthMonday(y, 8, 1)), 'Labour Day'], [y + '-09-30', 'National Day for Truth and Reconciliation'],
      [k(nthMonday(y, 9, 2)), 'Thanksgiving'], [y + '-11-11', 'Remembrance Day'], [y + '-12-25', 'Christmas Day']];
  }

  /* ---------- the made-up family, about 3 months of it (around today) ---------- */
  function docs() {
    const today = D.today();
    const t = (n) => D.addDays(today, n);
    const P = {}; PL.config.palette.forEach((p) => { P[p.id] = p.hex; });
    const y = +today.slice(0, 4);
    const bday = (n, year) => year + t(n).slice(4); // a birthday n days from today, in that year
    const out = {};
    const put = (col, kind, id, data) => { (out[col] = out[col] || []).push({ id, data: kind ? PL.models[kind](data) : data }); };

    // People (and the dog)
    [['dm-maya', 'Maya', 'parent', '🌸', P.rose, bday(-70, 1988)], ['dm-leo', 'Leo', 'parent', '🦁', P.sky, bday(52, 1986)],
     ['dm-leah', 'Leah', 'child', '🦊', P.apricot, bday(18, 2016)], ['dm-theo', 'Theo', 'child', '🚀', P.sage, bday(-20, 2019)],
     ['dm-nana', 'Nana Rosa', 'other', '🌻', P.butter, bday(80, 1954)], ['dm-biscuit', 'Biscuit', 'other', '🐶', P.lavender, bday(-35, 2021)]]
      .forEach(([id, name, role, avatar, color, birthday]) => put('members', 'member', id, { name, role, avatar, color, birthday }));

    // Calendar: weekly life, plus things that happen once
    const weekly = (...wd) => ({ freq: 'weekly', interval: 1, weekdays: wd, end: { type: 'never' } });
    const monthly = { freq: 'monthly', interval: 1, end: { type: 'never' } };
    const days = (n) => ({ freq: 'daily', interval: 1, end: { type: 'after', count: n } });
    const ev = (o) => Object.assign({ allDay: false, start: '', end: '', memberIds: [], repeat: null, reminder: null, location: '', notes: '' }, o);
    const start = t(-70);
    [
      { title: 'School run', date: start, start: '08:15', end: '08:45', memberIds: ['dm-leah', 'dm-theo'], repeat: weekly(1, 2, 3, 4, 5), location: 'Maple Grove Elementary', reminder: 15 },
      { title: 'Soccer practice', date: start, start: '17:00', end: '18:00', memberIds: ['dm-leah'], repeat: weekly(2, 4), location: 'Riverside Field', reminder: 30 },
      { title: 'Piano lesson', date: start, start: '16:00', end: '16:45', memberIds: ['dm-theo'], repeat: weekly(3), location: 'Ms. Alder’s studio' },
      { title: 'Swim lessons', date: start, start: '10:00', end: '10:45', memberIds: ['dm-theo'], repeat: weekly(6), location: 'Community pool' },
      { title: 'Yoga', date: start, start: '18:30', end: '19:30', memberIds: ['dm-maya'], repeat: weekly(1) },
      { title: 'Trash and recycling', date: start, allDay: true, repeat: weekly(3), reminder: 1440 },
      { title: 'Sunday dinner at Nana’s', date: start, start: '17:30', end: '20:00', memberIds: ['dm-nana'], repeat: weekly(0), location: 'Nana’s house' },
      { title: 'Walk Biscuit', date: start, start: '07:00', end: '07:30', memberIds: ['dm-leo', 'dm-biscuit'], repeat: weekly(0, 6) },
      { title: 'Date night', date: t(-26), start: '19:30', end: '22:00', memberIds: ['dm-maya', 'dm-leo'], repeat: monthly },
      { title: 'Book club', date: t(-38), start: '19:00', end: '21:00', memberIds: ['dm-maya'], repeat: monthly, location: 'The Corner Café' },
      { title: 'Back-to-school night', date: t(-41), start: '18:00', end: '19:30', memberIds: ['dm-maya', 'dm-leo'], location: 'School gym' },
      { title: 'Vet check-up', date: t(-33), start: '09:30', end: '10:15', memberIds: ['dm-biscuit', 'dm-leo'], location: 'Happy Paws Clinic' },
      { title: 'Dentist (Leah)', date: t(-18), start: '15:00', end: '15:45', memberIds: ['dm-leah'], location: 'Bright Smiles Dental' },
      { title: 'Costco run', date: t(-12), start: '10:00', end: '11:30', memberIds: ['dm-leo'] },
      { title: 'Field trip: science centre', date: t(-5), allDay: true, memberIds: ['dm-theo'], notes: 'Pack a lunch and a water bottle.' },
      { title: 'Haircut', date: t(-2), start: '11:00', end: '11:45', memberIds: ['dm-maya'] },
      { title: 'Parent-teacher meeting', date: t(1), start: '18:00', end: '18:30', memberIds: ['dm-maya', 'dm-leo'], location: 'Room 12', reminder: 60 },
      { title: 'Science fair', date: t(3), start: '10:00', end: '12:00', memberIds: ['dm-leah'], location: 'School gym' },
      { title: 'Plumber visit', date: t(6), start: '09:00', end: '10:00', memberIds: ['dm-leo'], notes: 'Kitchen sink.' },
      { title: 'Playdate with Sam', date: t(9), start: '14:00', end: '16:00', memberIds: ['dm-theo'] },
      { title: 'Work trip (Leo)', date: t(13), allDay: true, memberIds: ['dm-leo'], repeat: days(3), location: 'Calgary' },
      { title: 'Leah’s birthday party', date: t(18), start: '14:00', end: '17:00', memberIds: ['dm-leah'], location: 'Home', reminder: 1440 },
      { title: 'Flu shots', date: t(24), start: '16:00', end: '16:30', memberIds: ['dm-leah', 'dm-theo'], location: 'Family clinic' },
      { title: 'Weekend in Tofino', date: t(30), allDay: true, repeat: days(3), location: 'Tofino, BC' },
      { title: 'School concert', date: t(37), start: '18:30', end: '20:00', memberIds: ['dm-leah', 'dm-theo'], location: 'School gym' },
      { title: 'Nana’s doctor visit', date: t(44), start: '10:00', end: '11:00', memberIds: ['dm-nana', 'dm-maya'] },
      { title: 'Coach U8 soccer', date: start, start: '09:00', end: '10:30', memberIds: ['dm-leo'], repeat: weekly(6), location: 'Riverside Field', notes: 'Bring the cones and the ball bag.' },
      { title: 'Team meeting', date: start, start: '10:00', end: '10:45', memberIds: ['dm-maya'], repeat: weekly(1, 3) },
      { title: 'Choir practice', date: start, start: '19:00', end: '20:30', memberIds: ['dm-nana'], repeat: weekly(4), location: 'St. Mary’s hall' },
      { title: 'Church', date: start, start: '10:00', end: '11:15', memberIds: ['dm-nana'], repeat: weekly(0) },
      { title: 'Family movie night', date: start, start: '19:00', end: '21:00', repeat: weekly(5), notes: 'Whoever picked last week skips this week.' },
      { title: 'Family hike: Lighthouse Park', date: t(-21), start: '09:00', end: '13:00', memberIds: ['dm-maya', 'dm-leo', 'dm-leah', 'dm-theo', 'dm-biscuit'] },
      { title: 'Family hike: Lynn Canyon', date: t(11), start: '09:00', end: '13:00', memberIds: ['dm-maya', 'dm-leo', 'dm-leah', 'dm-theo', 'dm-biscuit'], notes: 'Pack lunch, water and Biscuit’s leash.' },
      { title: 'Swim test (level 3)', date: t(15), start: '10:00', end: '10:45', memberIds: ['dm-theo'], location: 'Community pool' },
      { title: 'Grandparents’ day at school', date: t(20), start: '13:00', end: '14:30', memberIds: ['dm-nana', 'dm-leah', 'dm-theo'], location: 'School gym' }
    ].forEach((e, i) => put('events', 'event', 'dme' + String(i + 1).padStart(2, '0'), ev(e)));

    // Public holidays (BC), this year and next
    const settings = { householdName: 'The Santos family', weekStart: 0, hour12: true, tempUnit: 'c', starsOn: true,
      weatherPlace: { name: 'Vancouver', lat: 49.28, lon: -123.12 },
      holidaySets: [{ key: 'CA-BC', name: 'British Columbia', full: 'Canada · British Columbia', flag: '🇨🇦', years: [y, y + 1], auto: true }] };
    [y, y + 1].forEach((yy) => bcHolidays(yy).forEach(([date, title]) => put('holidays', 'holiday', 'CA-BC~' + date + '~1', { date, title, set: 'CA-BC' })));
    out.settings = [{ id: 'main', data: settings }];

    // Chores, with ticks over the last two weeks
    const daily = { freq: 'daily', interval: 1, end: { type: 'never' } };
    const chores = [['dmc1', 'Make your bed', ['dm-leah', 'dm-theo'], daily, 1], ['dmc2', 'Unload the dishwasher', ['dm-leah'], weekly(1, 2, 3, 4, 5), 2],
      ['dmc3', 'Set the table', ['dm-theo'], weekly(0, 1, 2, 3, 4, 5, 6), 1], ['dmc4', 'Feed Biscuit', ['dm-leah', 'dm-theo'], daily, 1],
      ['dmc5', 'Tidy the playroom', ['dm-theo', 'dm-leah'], weekly(6), 3], ['dmc6', 'Brush Biscuit', ['dm-leah'], weekly(6), 2],
      ['dmc7', 'Take out the trash', ['dm-leo'], weekly(3), 1], ['dmc8', 'Laundry', ['dm-maya'], weekly(0, 3), 1],
      ['dmc9', 'Mow the lawn', ['dm-leo'], weekly(6), 2], ['dmc10', 'Meal prep for the week', ['dm-maya'], weekly(0), 2],
      ['dmc11', 'Water the garden', ['dm-nana'], weekly(0, 3), 1], ['dmc12', 'Clean the bathroom', ['dm-maya', 'dm-leo'], weekly(5), 2]];
    chores.forEach(([id, title, memberIds, repeat, stars]) => put('chores', 'chore', id, { title, memberIds, repeat, stars, date: t(-70) }));
    for (let n = 0; n <= 21; n++) { // ticks for the last 3 weeks; a few missed, like real life
      const dt = t(-n), dow = D.dow(dt);
      chores.forEach(([id, , memberIds, repeat], ci) => memberIds.forEach((m, mi) => {
        if (repeat.weekdays && !repeat.weekdays.includes(dow)) return;
        if ((n * 7 + ci * 3 + mi) % 6 === 4) return;
        if (n === 0 && (ci + mi) % 2) return; // today: some done, some still to do
        put('completions', 'completion', id + '~' + dt + '~' + m, { choreId: id, date: dt, memberId: m });
      }));
    }
    const steps = (...x) => x.map((text, i) => ({ id: 's' + (i + 1), text }));
    put('routines', 'routine', 'dmr1', { title: 'Morning routine', when: 'morning', memberIds: ['dm-leah', 'dm-theo'], weekdays: [1, 2, 3, 4, 5], stars: 2, steps: steps('Get dressed', 'Eat breakfast', 'Brush teeth', 'Pack school bag') });
    put('routines', 'routine', 'dmr2', { title: 'Bedtime routine', when: 'bedtime', memberIds: ['dm-leah', 'dm-theo'], weekdays: [0, 1, 2, 3, 4, 5, 6], stars: 2, steps: steps('Bath', 'Pyjamas', 'Brush teeth', 'Story time') });
    put('routines', 'routine', 'dmr3', { title: 'Sunday reset', when: 'afternoon', memberIds: ['dm-maya', 'dm-leo'], weekdays: [0], stars: 1, steps: steps('Look at next week’s calendar', 'Plan the dinners', 'Check the grocery list', 'Tidy the kitchen') });
    for (let n = 1; n <= 14; n++) {
      const dt = t(-n), dow = D.dow(dt);
      ['dm-leah', 'dm-theo'].forEach((m, mi) => {
        put('rlogs', 'rlog', 'dmr2~' + dt + '~' + m, { routineId: 'dmr2', date: dt, memberId: m, done: (n + mi) % 4 === 2 ? ['s1', 's2', 's3'] : ['s1', 's2', 's3', 's4'] });
        if (dow >= 1 && dow <= 5) put('rlogs', 'rlog', 'dmr1~' + dt + '~' + m, { routineId: 'dmr1', date: dt, memberId: m, done: (n + mi) % 5 === 1 ? ['s1', 's2'] : ['s1', 's2', 's3', 's4'] });
      });
      if (dow === 0) ['dm-maya', 'dm-leo'].forEach((m) => put('rlogs', 'rlog', 'dmr3~' + dt + '~' + m, { routineId: 'dmr3', date: dt, memberId: m, done: ['s1', 's2', 's3', 's4'] }));
    }
    [['dmw1', 'Pick the movie', '🎬', 5], ['dmw2', 'Ice cream outing', '🍦', 8], ['dmw3', 'Extra story at bedtime', '📚', 3], ['dmw4', 'Park trip with a friend', '🛝', 15]]
      .forEach(([id, title, emoji, cost]) => put('rewards', 'reward', id, { title, emoji, cost }));
    put('redemptions', 'redemption', 'dmx1', { rewardId: 'dmw3', title: 'Extra story at bedtime', cost: 3, memberId: 'dm-theo', date: t(-3) });
    put('redemptions', 'redemption', 'dmx2', { rewardId: 'dmw1', title: 'Pick the movie', cost: 5, memberId: 'dm-leah', date: t(-8) });
    put('redemptions', 'redemption', 'dmx3', { rewardId: 'dmw2', title: 'Ice cream outing', cost: 8, memberId: 'dm-leah', date: t(-13) });
    put('redemptions', 'redemption', 'dmx4', { rewardId: 'dmw1', title: 'Pick the movie', cost: 5, memberId: 'dm-theo', date: t(-15) });
    put('redemptions', 'redemption', 'dmx5', { rewardId: 'dmw4', title: 'Park trip with a friend', cost: 15, memberId: 'dm-theo', date: t(-6) });
    put('redemptions', 'redemption', 'dmx6', { rewardId: 'dmw3', title: 'Extra story at bedtime', cost: 3, memberId: 'dm-leah', date: t(-1) });

    // Recipes and two weeks of dinners (plus next week)
    const R = {
      adobo: ['Chicken adobo', '🍗', ['1 kg chicken thighs', '½ cup soy sauce', '⅓ cup vinegar', '1 head garlic', '3 bay leaves', '1 tsp peppercorns', '2 cups rice'], 'Mix soy sauce, vinegar, garlic, bay leaves and pepper.\nAdd the chicken and marinate 30 minutes.\nSimmer covered for 30 minutes.\nUncover and cook until the sauce thickens.\nServe with rice.'],
      curry: ['Thai green chicken curry', '🍛', ['500 g chicken thighs', '1 can coconut milk', '3 tbsp green curry paste', '1 red bell pepper', '1 cup green beans', '1 tbsp fish sauce', 'Thai basil', '2 cups jasmine rice'], 'Fry the curry paste for 1 minute.\nAdd the chicken and cook until white.\nPour in the coconut milk and simmer 10 minutes.\nAdd the vegetables for 5 more minutes.\nSeason with fish sauce and top with basil.'],
      spag: ['Spaghetti bolognese', '🍝', ['400 g spaghetti', '500 g ground beef', '1 onion', '2 garlic cloves', '1 can crushed tomatoes', 'Parmesan'], 'Cook the onion and garlic.\nBrown the beef.\nAdd the tomatoes and simmer 20 minutes.\nBoil the spaghetti and mix.'],
      sinigang: ['Sinigang na baboy', '🍲', ['800 g pork ribs', '1 packet tamarind soup mix', '2 tomatoes', '1 onion', '1 radish', '1 bunch kangkong', '6 green beans', 'Fish sauce'], 'Boil the pork with onion and tomatoes until tender.\nAdd the tamarind mix.\nAdd radish and beans for 5 minutes.\nAdd the greens and season with fish sauce.'],
      tacos: ['Fish tacos', '🌮', ['500 g white fish', '8 small tortillas', '½ red cabbage', '2 limes', '1 avocado', 'Sour cream', 'Taco spice'], 'Season and cook the fish.\nSlice the cabbage and avocado.\nWarm the tortillas.\nBuild the tacos and squeeze lime on top.'],
      rice: ['Veggie fried rice', '🍚', ['3 cups cooked rice', '2 eggs', '1 cup frozen peas and carrots', '3 green onions', '2 tbsp soy sauce'], 'Scramble the eggs and set aside.\nFry the vegetables.\nAdd rice and soy sauce.\nMix in the eggs and green onions.'],
      pancakes: ['Weekend pancakes', '🥞', ['2 cups flour', '2 tbsp sugar', '2 tsp baking powder', '2 eggs', '1.5 cups milk', 'Butter', 'Maple syrup'], 'Mix the dry ingredients.\nWhisk in eggs and milk.\nCook spoonfuls in a buttered pan until golden.'],
      pizza: ['Homemade pizza', '🍕', ['2 pizza doughs', '1 cup tomato sauce', '2 cups mozzarella', 'Pepperoni', '1 bell pepper', 'Mushrooms'], 'Heat the oven to 250°C.\nSpread the sauce on the dough.\nAdd cheese and toppings.\nBake 10 to 12 minutes.']
    };
    Object.entries(R).forEach(([k, [title, emoji, ingredients, stepsText]]) => put('recipes', 'recipe', 'dmrc-' + k, { title, emoji, servings: 4, ingredients, steps: stepsText }));
    const rota = ['adobo', 'spag', 'curry', 'tacos', 'sinigang', 'pizza', 'rice'];
    for (let n = -14; n <= 6; n++) {
      const date = t(n), k = rota[((n % 7) + 7) % 7];
      put('meals', 'meal', date + '~dinner', { date, slot: 'dinner', title: R[k][0], recipeId: 'dmrc-' + k, shopped: n >= -1 && n <= 2 });
      if (D.dow(date) === 6) put('meals', 'meal', date + '~breakfast', { date, slot: 'breakfast', title: 'Weekend pancakes', recipeId: 'dmrc-pancakes' });
    }

    // Lists: groceries grouped by meal, packing, to-do
    put('lists', 'list', 'dml1', { title: 'Groceries' }); put('lists', 'list', 'dml2', { title: 'Tofino packing' }); put('lists', 'list', 'dml3', { title: 'Family to-do' });
    put('lists', 'list', 'dml4', { title: 'Leah’s birthday wish list' }); put('lists', 'list', 'dml5', { title: 'Theo’s Lego list' });
    const now = Date.now();
    let i = 0;
    const item = (listId, text, o) => put('listitems', 'listitem', 'dmi' + String(++i).padStart(3, '0'), Object.assign({ listId, text, done: false, at: now - (500 - i) * 1000 }, o || {}));
    const g = (n, k) => D.fmt(t(n), { weekday: 'short' }) + ' · ' + R[k][0];
    [0, 1, 2].forEach((n) => { const k = rota[((n % 7) + 7) % 7]; R[k][2].slice(0, 5).forEach((x, j) => item('dml1', x, { group: g(n, k), done: j === 4 })); });
    ['Milk', 'Eggs', 'Bananas', 'Dog food', 'Coffee'].forEach((x, j) => item('dml1', x, { done: j === 3 }));
    ['Rain jackets', 'Swimsuits', 'Sunscreen', 'Phone chargers', 'Snacks for the drive', 'Biscuit’s leash and bowl'].forEach((x, j) => item('dml2', x, { done: j === 3 }));
    ['Book flu shots', 'Return library books', 'Fix bike tire', 'Order Leah’s birthday cake', 'Renew car insurance', 'Call the roofer (Leo)', 'Sign Theo’s field trip form'].forEach((x, j) => item('dml3', x, { done: j === 0 || j === 6 }));
    ['Art kit with markers', 'Roller skates (size 3)', 'Friendship bracelet kit', 'A new book series', 'Sleepover with Mia'].forEach((x, j) => item('dml4', x, { done: j === 0 }));
    ['Lego fire station', 'Lego dinosaur set', 'Minifigure pack', 'Storage box for Lego'].forEach((x, j) => item('dml5', x, { done: j === 3 }));

    // Countdowns
    const xmas = (today > y + '-12-25' ? y + 1 : y) + '-12-25';
    put('countdowns', 'countdown', 'dmk1', { title: 'Leah’s birthday', emoji: '🎂', date: t(18) });
    put('countdowns', 'countdown', 'dmk2', { title: 'Weekend in Tofino', emoji: '🏕️', date: t(30) });
    put('countdowns', 'countdown', 'dmk3', { title: 'Christmas', emoji: '🎄', date: xmas, yearly: true });
    put('countdowns', 'countdown', 'dmk4', { title: 'Nana Rosa’s birthday', emoji: '🌻', date: t(80), yearly: true });
    put('countdowns', 'countdown', 'dmk5', { title: 'Theo’s swim test', emoji: '🏊', date: t(15) });
    put('countdowns', 'countdown', 'dmk6', { title: 'Family hike', emoji: '🥾', date: t(11) });

    // Notes: plain notes and tables
    put('notes', 'note', 'dmn1', { kind: 'note', title: 'Wi-Fi and door codes', by: 'Leo', at: now - 9 * 864e5, text: 'Wi-Fi: SantosHome\nPassword: sunshine-42\n\nGarage code: 4815\nShed lock: 2023' });
    put('notes', 'note', 'dmn2', { kind: 'note', title: 'Babysitter info', by: 'Maya', at: now - 4 * 864e5, text: 'Bedtime: Theo 7:30, Leah 8:30.\nNo screens after 7.\nBiscuit gets one scoop of food at 6.\nEmergency: call Maya or Leo first, then Nana Rosa.' });
    put('notes', 'note', 'dmn3', { kind: 'table', title: 'Christmas budget', by: 'Maya', at: now - 2 * 864e5,
      cols: [{ name: 'Gift', type: 'text' }, { name: 'For', type: 'text' }, { name: 'Cost', type: 'number' }, { name: 'Bought?', type: 'check' }],
      rows: [['Lego set', 'Theo', '$79.99', true], ['Art kit', 'Leah', '$45.00', false], ['Scarf', 'Nana Rosa', '$32.50', true], ['Board game', 'Everyone', '$54.00', false], ['New bed', 'Biscuit', '$65.00', false]] });
    put('notes', 'note', 'dmn4', { kind: 'table', title: 'Tofino trip costs', by: 'Leo', at: now - 864e5,
      cols: [{ name: 'What', type: 'text' }, { name: 'Cost', type: 'number' }, { name: 'Paid', type: 'check' }],
      rows: [['Cabin (2 nights)', '$420.00', true], ['Ferry', '$185.00', false], ['Gas', '$90.00', false], ['Food', '$150.00', false]] });

    put('notes', 'note', 'dmn5', { kind: 'note', title: 'Nana’s adobo tips', by: 'Nana Rosa', at: now - 6 * 864e5, text: 'Use chicken thighs, not breast. They stay soft.\nDo not stir after you add the vinegar until it boils, or it tastes sour.\nA spoon of brown sugar at the end makes the kids happy.\nIt is even better the next day!' });
    put('notes', 'note', 'dmn6', { kind: 'table', title: 'Movie night picks', by: 'Leah', at: now - 3 * 864e5,
      cols: [{ name: 'Movie', type: 'text' }, { name: 'Picked by', type: 'text' }, { name: 'Stars (1-5)', type: 'number' }, { name: 'Watched', type: 'check' }],
      rows: [['A space adventure', 'Theo', '4', true], ['The baking contest one', 'Leah', '5', true], ['A dog movie', 'Maya', '3', true], ['A funny animated film', 'Leo', '', false]] });

    // Photos (newest last)
    PHOTOS.forEach(([id, credit], n) => put('photos', 'photo', 'dmp' + String(n + 1).padStart(2, '0'), { assetId: 'unsplash', src: U(id), credit, at: now - (PHOTOS.length - n) * 3600e3 }));
    return out;
  }

  PL.demo = { docs, PHOTOS };

  /* ---------- inside the demo: a banner; everywhere in a home: the logo goes to the start page ---------- */
  function start() {
    const brand = document.querySelector('.brand');
    if (brand && !brand.dataset.home) {
      brand.dataset.home = '1';
      brand.removeAttribute('aria-hidden');
      brand.setAttribute('role', 'link'); brand.setAttribute('tabindex', '0'); brand.setAttribute('aria-label', 'Kalendaryo start page');
      brand.classList.add('brand-link');
      const go = () => { location.href = '/'; };
      brand.addEventListener('click', go);
      brand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    }
    if (window.KAL && KAL.demo) {
      const content = document.querySelector('.content');
      if (content && !content.querySelector('.demo-banner')) {
        content.prepend(PL.h('div', { class: 'demo-banner', role: 'note' },
          PL.h('span', {}, '👀 ', PL.h('strong', {}, 'This is a demo home.'), ' Try anything. Changes are not saved.'),
          PL.h('a', { class: 'btn primary', href: '/' }, 'Create your own home')));
      }
      document.title = 'Demo home · ' + PL.config.appName;
    }
  }
  // The app frame is drawn after start-up; wait for it.
  const wait = setInterval(() => { if (document.querySelector('.app .brand')) { clearInterval(wait); start(); } }, 150);
  setTimeout(() => clearInterval(wait), 30000);
})();
