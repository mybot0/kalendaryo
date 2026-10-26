/*
 * config.js — names, plan types, avatars. Change wording and options here.
 */
(function () {
  const TR = window.TR;
  const boot = window.TRIPLY || {};
  const base = String(boot.base || '').replace(/\/+$/, '');

  // text fields: [key, label, placeholder, kind]
  const TYPES = {
    flight: {
      label: 'Flight', icon: 'plane', color: '#A8CDEA', needsStart: true,
      startLabel: 'Departs', endLabel: 'Arrives', locationLabel: 'Departure airport / terminal', titlePlaceholder: 'Auto: Vancouver → Montreal',
      fields: [['airline', 'Airline', 'Air Canada'], ['flightNo', 'Flight number', 'AC123'], ['from', 'From', 'Vancouver (YVR)'], ['to', 'To', 'Montreal (YUL)'], ['terminal', 'Terminal', ''], ['gate', 'Gate', ''], ['seat', 'Seat', '']],
      sub: (i) => [i.data.airline, i.data.flightNo].filter(Boolean).join(' ')
    },
    hotel: {
      label: 'Hotel', icon: 'bed', color: '#C7B7EA', needsStart: true, multiDay: true,
      startLabel: 'Check-in', endLabel: 'Check-out', locationLabel: 'Address', titlePlaceholder: 'Hotel name',
      fields: [['room', 'Room', 'Double, sea view'], ['contact', 'Phone or e-mail', '']],
      sub: (i) => i.location
    },
    car: {
      label: 'Car rental', icon: 'car', color: '#F1DC8B', needsStart: true, multiDay: true,
      startLabel: 'Pick-up', endLabel: 'Drop-off', locationLabel: 'Pick-up location', titlePlaceholder: 'Auto: company name',
      fields: [['company', 'Company', 'Hertz'], ['vehicle', 'Vehicle', 'Fiat 500'], ['dropoffLocation', 'Drop-off location', '']],
      sub: (i) => [i.data.vehicle, i.location].filter(Boolean).join(' · ')
    },
    cruise: {
      label: 'Cruise', icon: 'ship', color: '#9ED8C6', needsStart: true, multiDay: true,
      startLabel: 'Embark', endLabel: 'Disembark', locationLabel: 'Embarkation port', titlePlaceholder: 'Auto: ship name',
      fields: [['cruiseLine', 'Cruise line', ''], ['ship', 'Ship', ''], ['cabin', 'Cabin', ''], ['disembarkLocation', 'Disembarkation port', '']],
      sub: (i) => [i.data.cruiseLine, i.location].filter(Boolean).join(' · ')
    },
    activity: {
      label: 'Activity', icon: 'ticket', color: '#F6C28E', needsStart: false,
      startLabel: 'Starts', endLabel: 'Ends', locationLabel: 'Location', titlePlaceholder: 'City walking tour',
      fields: [['cost', 'Cost', '45', 'number'], ['currency', 'Currency', 'EUR']],
      sub: (i) => [i.location, i.data.cost !== undefined ? (i.data.currency ? i.data.currency + ' ' : '') + i.data.cost : ''].filter(Boolean).join(' · ')
    },
    restaurant: {
      label: 'Restaurant', icon: 'meal', color: '#F4A59A', needsStart: true,
      startLabel: 'Reservation', endLabel: 'Until', locationLabel: 'Address', titlePlaceholder: 'Restaurant name',
      fields: [['people', 'People', '4', 'number']],
      sub: (i) => [i.data.people ? 'Table for ' + i.data.people : '', i.location].filter(Boolean).join(' · ')
    },
    place: {
      label: 'Place', icon: 'pin', color: '#B4D9AA', needsStart: false,
      startLabel: 'Day', endLabel: 'Until', locationLabel: 'Address', titlePlaceholder: 'Prado Museum',
      fields: [['website', 'Website', 'museodelprado.es']],
      sub: (i) => i.location
    },
    note: {
      label: 'Note', icon: 'note', color: '#EFB2CB', needsStart: false,
      startLabel: 'Day', endLabel: 'Until', locationLabel: 'Where', titlePlaceholder: 'Note title',
      fields: [],
      sub: (i) => (i.notes || '').split('\n')[0].slice(0, 80)
    }
  };
  const TYPE_ORDER = ['flight', 'hotel', 'car', 'cruise', 'activity', 'restaurant', 'place', 'note'];
  const BOOKING_TYPES = ['flight', 'hotel', 'car', 'cruise', 'restaurant'];

  TR.config = {
    appName: 'Triply',
    tagline: 'by Kalendaryo',
    base,
    publicUrl: String(boot.publicUrl || '').replace(/\/+$/, ''),
    api: base + '/api',
    types: TYPES,
    typeOrder: TYPE_ORDER,
    bookingTypes: BOOKING_TYPES,
    neutralColor: '#E4E2DA',
    avatars: ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐧', '🐨', '🦉', '🐢', '🦋', '🐳', '🌻', '🌵', '🍀'],
    coverEmojis: ['✈️', '🏖️', '🏔️', '🌆', '🚢', '🏕️', '🗺️', '🚗', '🏝️', '🎿', '🍷', '🏛️'],
    coverColors: ['#F4A59A', '#F6C28E', '#F1DC8B', '#B4D9AA', '#9ED8C6', '#A8CDEA', '#C7B7EA', '#EFB2CB'],
    reactions: ['👍', '❤️', '😂', '🎉', '😮', '🙏', '✈️', '🏖️', '🍕', '🍷', '☀️', '📍', '✅', '👀', '🔥', '🥳'],
    roleHelp: {
      owner: 'Runs the trip: edits everything, invites people, can delete the trip.',
      editor: 'Adds and changes plans, chats and shares files.',
      viewer: 'Can look at the plans and chat (if the owner allows it), but not change anything.'
    }
  };
  // Link to this page from outside (invite links, personal links).
  TR.pageUrl = () => TR.config.publicUrl || (location.origin + base);
  TR.personalLink = (token) => TR.pageUrl() + '/#/t/' + token;
  TR.blobUrl = (id) => TR.config.api + '/blobs/' + id;
})();
