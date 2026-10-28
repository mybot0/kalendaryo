// Tests only: answers like the AI would, so Triply's AI helpers can be tried without an API key.
module.exports = async ({ kind, content }) => {
  const text = content.map((c) => c.text || '').join('\n');
  const year = (text.match(/(\d{4})-\d{2}-\d{2} to/) || [])[1] || '2027';
  const start = (text.match(/(\d{4}-\d{2}-\d{2}) to/) || [])[1] || year + '-06-04';
  const add = (n) => { const d = new Date(start + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  if (kind === 'read') return { usd: 0.004, text: JSON.stringify({ bookings: [
    { type: 'flight', airline: 'Air Canada', flightNo: 'AC 880', from: 'Vancouver (YVR)', to: 'Paris (CDG)', start_date: add(0), start_time: '15:55', end_date: add(1), end_time: '10:30', terminal: 'M', seat: '31A', confirmation: '7XK2PQ', passengers: ['Maya', 'Leo'] },
    { type: 'flight', airline: 'Air Canada', flightNo: 'AC 891', from: 'Rome (FCO)', to: 'Toronto (YYZ)', start_date: add(13), start_time: '11:35', end_date: add(13), end_time: '15:20', confirmation: '7XK2PQ' },
    { type: 'hotel', title: 'Shangri-La Paris', address: '10 Avenue d’Iéna, Paris', start_date: add(1), start_time: '15:00', end_date: add(4), end_time: '12:00', room: 'Family suite', phone: '+33 1 53 67 19 98', confirmation: '88213', price: 4650, currency: 'EUR' }
  ] }) };
  if (kind === 'flight') return { usd: 0.02, text: JSON.stringify({ flights: [
    { airline: 'Air Canada', flightNo: 'AC 880', from: 'Vancouver (YVR)', to: 'Paris (CDG)', start_date: add(0), start_time: '15:55', end_date: add(1), end_time: '10:30', terminal: 'M', duration: '9 h 35 min', aircraft: 'Boeing 787' }
  ] }) };
  if (kind === 'plan') return { usd: 0.12, text: '```json\n' + JSON.stringify({ summary: 'Paris then Rome, relaxed.', travelers: 4, cities: [{ name: 'Paris', from_day: 1, to_day: 3, highlights: 'Louvre, Seine' }, { name: 'Rome', from_day: 4, to_day: 5, highlights: 'Colosseum' }],
    items: [
      { type: 'flight', title: 'Vancouver (YVR) → Paris (CDG)', day: 1, start_time: '15:55', end_day: 2, end_time: '10:30', airline: 'Air Canada', flightNo: 'AC 880', from: 'Vancouver (YVR)', to: 'Paris (CDG)', est_cost: 5400, currency: 'EUR' },
      { type: 'hotel', title: 'Le Bristol Paris', day: 2, start_time: '15:00', end_day: 4, end_time: '11:00', location: '112 Rue du Faubourg Saint-Honoré, Paris', est_cost: 3600, currency: 'EUR' },
      { type: 'activity', title: 'Louvre guided tour', day: 3, start_time: '9:30', end_time: '12:00', location: 'Musée du Louvre', est_cost: 360, currency: 'EUR' },
      { type: 'restaurant', title: 'Le Relais de l’Entrecôte', day: 3, start_time: '19:30', location: 'Paris', est_cost: 180, currency: 'EUR' },
      { type: 'car', title: 'Train Paris → Rome', day: 4, start_time: '08:00', company: 'Frecciarossa', est_cost: 600, currency: 'EUR' }
    ],
    cost: { currency: 'EUR', flights: 5400, hotels: 6000, tours: 800, food: 1500, transport: 700, low: 13000, high: 15500 }, packing: ['Plug adapters', 'Walking shoes'] }) + '\n```' };
  return { usd: 0, text: '{}' };
};
