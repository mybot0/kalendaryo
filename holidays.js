// Tests only: a tiny stand-in for the public holiday list (date.nager.at). node test/fakes/holidays.js 3499
const http = require('http');
const ca = (y) => [
  ['01-01', "New Year's Day", true], ['02-' + (y === 2027 ? '15' : '16'), 'Family Day', false, ['CA-AB', 'CA-BC', 'CA-ON', 'CA-SK']], ['04-03', 'Good Friday', true],
  ['05-' + (y === 2027 ? '24' : '18'), 'Victoria Day', true], ['07-01', 'Canada Day', true], ['08-' + (y === 2027 ? '02' : '03'), 'British Columbia Day', false, ['CA-BC']],
  ['09-07', 'Labour Day', true], ['09-30', 'National Day for Truth and Reconciliation', false, ['CA-BC', 'CA-NT', 'CA-YT']], ['10-12', 'Thanksgiving', false, ['CA-BC', 'CA-ON']],
  ['11-11', 'Remembrance Day', false, ['CA-BC', 'CA-AB']], ['12-25', 'Christmas Day', true], ['12-26', 'Boxing Day', false, ['CA-ON']]
].map(([d, name, global, counties]) => ({ date: y + '-' + d, localName: name, name, countryCode: 'CA', global, counties: counties || null, types: ['Public'] }));
const us = (y) => [['01-01', "New Year's Day"], ['07-04', 'Independence Day'], ['11-26', 'Thanksgiving Day'], ['12-25', 'Christmas Day']].map(([d, name]) => ({ date: y + '-' + d, localName: name, name, countryCode: 'US', global: true, counties: null, types: ['Public'] }));
http.createServer((req, res) => {
  const m = req.url.match(/\/PublicHolidays\/(\d{4})\/([A-Z]{2})$/);
  let body = null;
  if (req.url.endsWith('/AvailableCountries')) body = [{ countryCode: 'CA', name: 'Canada' }, { countryCode: 'US', name: 'United States' }, { countryCode: 'GB', name: 'United Kingdom' }];
  else if (m && m[2] === 'CA') body = ca(+m[1]);
  else if (m && m[2] === 'US') body = us(+m[1]);
  if (!body) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
}).listen(+process.argv[2] || 3499);
