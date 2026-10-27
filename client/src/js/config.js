/*
 * config.js — every adjustable default lives here.
 * Change colors, roles, reminder choices or dashboard defaults in this one file.
 * (Theme colors for the page itself are in styles/theme.css.)
 */
(function () {
  const PL = (window.PL = window.PL || {});

  PL.config = {
    appName: 'Kalendaryo',
    tagline: 'your home calendar',
    version: '0.5 (round 3)',

    // Pastel palette offered when choosing a person's or an event's color.
    palette: [
      { id: 'coral',    name: 'Coral',    hex: '#F4A59A' },
      { id: 'apricot',  name: 'Apricot',  hex: '#F6C28E' },
      { id: 'butter',   name: 'Butter',   hex: '#F1DC8B' },
      { id: 'sage',     name: 'Sage',     hex: '#B4D9AA' },
      { id: 'mint',     name: 'Mint',     hex: '#9ED8C6' },
      { id: 'sky',      name: 'Sky',      hex: '#A8CDEA' },
      { id: 'lavender', name: 'Lavender', hex: '#C7B7EA' },
      { id: 'rose',     name: 'Rose',     hex: '#EFB2CB' }
    ],
    neutralColor: '#CBD0C6', // used when an event has no person and no color

    // Emoji avatars a family member can pick from.
    avatars: ['🦊', '🐼', '🦁', '🐯', '🐨', '🐸', '🐙', '🦄', '🐝', '🦋', '🐢', '🐬',
              '🌻', '🌈', '⭐', '🚀', '⚽', '🎨', '🎸', '📚', '🧸', '🍓', '🐶', '🐱'],

    roles: [
      { id: 'parent', label: 'Parent' },
      { id: 'child',  label: 'Child' },
      { id: 'other',  label: 'Other' }
    ],

    calendarViews: [
      { id: 'day',    label: 'Day' },
      { id: 'week',   label: 'Week' },
      { id: 'month',  label: 'Month' },
      { id: 'agenda', label: 'Agenda' }
    ],

    // Minutes before an event. null means no reminder.
    reminderOptions: [
      { value: null, label: 'No reminder' },
      { value: 0,    label: 'At the time' },
      { value: 5,    label: '5 minutes before' },
      { value: 15,   label: '15 minutes before' },
      { value: 30,   label: '30 minutes before' },
      { value: 60,   label: '1 hour before' },
      { value: 1440, label: '1 day before' }
    ],
    allDayReminderHour: 8, // all-day events remind from 8 AM

    // Household-wide settings (shared by every device). Saved in the database.
    householdDefaults: {
      householdName: 'Our home',
      weekStart: 0,   // 0 = Sunday, 1 = Monday
      hour12: true,
      weatherPlace: null, // { name, lat, lon }
      tempUnit: 'c',      // 'c' or 'f'
      starsOn: true,    // stars for chores and routines, and rewards to spend them on
      pinHash: ''       // optional parent PIN (hashed). A convenience, not security.
    },

    // Per-device settings (saved only on this device).
    deviceDefaults: {
      textScale: 1,          // 1, 1.15, 1.3
      reduceMotion: false,
      defaultView: 'month',
      keepAwake: false,
      notify: false,         // reminders on this device while the page is open
      hiddenMembers: [],     // people switched off in the calendar filter
      lastScreen: 'home',
      widgets: [
        { id: 'today',    visible: true, size: 'large' },
        { id: 'chores',   visible: true, size: 'small' },
        { id: 'family',   visible: true, size: 'small' },
        { id: 'week',     visible: true, size: 'large' },
        { id: 'upcoming', visible: true, size: 'small' },
        { id: 'meals',    visible: true, size: 'small' },
        { id: 'countdowns', visible: true, size: 'small' },
        { id: 'photos',  visible: true, size: 'small' },
        { id: 'weather', visible: true, size: 'small' }
      ]
    },

    widgetSizes: [
      { id: 'small',  label: 'Small' },
      { id: 'medium', label: 'Medium' },
      { id: 'large',  label: 'Large' },
      { id: 'full',   label: 'Full width' }
    ],

    textScales: [
      { value: 1,    label: 'Normal' },
      { value: 1.15, label: 'Large' },
      { value: 1.3,  label: 'Extra large' }
    ],

    // Screens shown in the navigation. `ready: false` shows a "Soon" tag.
    screens: [
      { id: 'home',     label: 'Home',     icon: 'home',     ready: true },
      { id: 'calendar', label: 'Calendar', icon: 'calendar', ready: true },
      { id: 'tasks',    label: 'Chores',   icon: 'check',    ready: true },
      { id: 'meals',    label: 'Meals',    icon: 'meal',     ready: true },
      { id: 'countdowns', label: 'Countdowns', icon: 'cake',  ready: true, hidden: true },
      { id: 'lists',    label: 'Lists',    icon: 'list',     ready: true },
      { id: 'notes',    label: 'Notes',    icon: 'note',     ready: true },
      { id: 'photos',   label: 'Photos',   icon: 'image',    ready: true },
      { id: 'family',   label: 'People',   icon: 'users',    ready: true },
      { id: 'settings', label: 'Settings', icon: 'settings', ready: true }
    ]
  };
  // Lists that use `id` also get `value`, so they can feed selectors directly.
  ['roles','calendarViews','widgetSizes'].forEach(function (k) { PL.config[k].forEach(function (o) { o.value = o.id; }); });
})();

