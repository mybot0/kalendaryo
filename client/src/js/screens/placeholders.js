/* screens/placeholders.js — honest "coming soon" pages for features planned for later rounds. */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const text = {
    meals: ['Meal planning', 'Plan the week’s dinners, keep recipes and build a shopping list. Planned for round 3.'],
  };
  Object.keys(text).forEach((id) => {
    PL.screens[id] = {
      mount(root) {
        const t = text[id];
        root.append(PL.h('div', { class: 'screen-page' },
          PL.h('header', { class: 'page-head' }, PL.h('h1', {}, t[0])),
          PL.ui.emptyState({ icon: PL.config.screens.find((s) => s.id === id).icon, title: 'Coming soon', text: t[1], action: PL.ui.button('Back to Home', { icon: 'home', onClick: () => PL.nav.go('home') }) })));
        return { update() {}, destroy() {} };
      }
    };
  });
})();

