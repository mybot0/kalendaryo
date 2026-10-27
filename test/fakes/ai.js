// Tests only: answers like Claude would, so the app can be tried without an API key.
module.exports = (prompt) => {
  const dates = prompt.match(/these dates: ([0-9, -]+)\./);
  if (dates) {
    const names = ['Thai green chicken curry', 'Chicken adobo', 'Spaghetti bolognese', 'Fish tacos', 'Veggie stir fry', 'Sinigang na baboy', 'Lentil soup'];
    return JSON.stringify(dates[1].split(',').map((d, i) => ({ date: d.trim(), title: names[i % names.length], recipeId: '' })));
  }
  const many = prompt.match(/each for \d+ people:\s*([\s\S]*?)\s*For each dish/); // the server turns new lines into spaces
  if (many) {
    return JSON.stringify(many[1].split(/\s*\d+\.\s+/).filter(Boolean).map((t) => ({
      title: t, emoji: '🍲', ingredients: /adobo/i.test(t) ? ['1 kg chicken', '½ cup soy sauce', '⅓ cup vinegar', '1 head garlic', '1 onion'] : ['500 g chicken thighs', '1 can coconut milk', '3 tbsp green curry paste', '2 cups jasmine rice', '1 onion'],
      steps: ['Prepare everything.', 'Cook it.', 'Serve.'] })));
  }
  const one = prompt.match(/wants to cook "([^"]+)"/);
  if (one) return JSON.stringify({ title: one[1].replace(/\b\w/g, (c) => c.toUpperCase()), emoji: '🍛', ingredients: ['500 g chicken thighs', '1 can (400 ml) coconut milk', '3 tbsp green curry paste', '1 red bell pepper', '1 cup green beans', '1 tbsp fish sauce', '1 tsp brown sugar', 'Thai basil', '2 cups jasmine rice'],
    steps: ['Cut the chicken into bite-size pieces.', 'Fry the curry paste in a little oil for 1 minute.', 'Add the chicken and cook until white.', 'Pour in the coconut milk and simmer 10 minutes.', 'Add the pepper and beans, cook 5 more minutes.', 'Season with fish sauce and sugar, top with basil.', 'Serve with rice.'] });
  const hol = prompt.match(/public holidays \(days off\) for (.+) in (\d{4})/);
  if (hol) return JSON.stringify([{ date: hol[2] + '-01-01', title: "New Year's Day" }, { date: hol[2] + '-06-12', title: 'Independence Day' }, { date: hol[2] + '-12-25', title: 'Christmas Day' }]);
  return '[]';
};
