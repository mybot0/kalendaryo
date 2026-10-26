/*
 * examples.js — web version only. The grey "For example: …" hints on the start page.
 * Every visit picks new ones at random. All names are made up. Edit the lists freely.
 */
(function () {
  const PL = (window.PL = window.PL || {});

  const names = [
    'Maya', 'Kenji', 'Sofia', 'Noah', 'Aisha', 'Mateo', 'Lena', 'Omar', 'Hana', 'Diego',
    'Chloe', 'Arjun', 'Isla', 'Leo', 'Amara', 'Lucas', 'Mei', 'Ethan', 'Zara', 'Gabriel',
    'Nina', 'Kai', 'Elena', 'Samir', 'Ivy', 'Marco', 'Priya', 'Felix', 'Yuna', 'Theo',
    'Carmen', 'Jonah', 'Rosa', 'Ali', 'Freya', 'Tomas', 'Leila', 'Owen', 'Naomi', 'Hugo',
    'Bea', 'Paolo', 'Liza', 'Migs', 'Tala', 'Andoy', 'Joy', 'Bong', 'Mika', 'Jun',
    'Lola Nena', 'Tito Ben', 'Tita Lorna', 'Lolo Ramon', 'Ate Grace', 'Kuya Mark', 'Nanay Rose', 'Tatay Boy', 'Inday', 'Dodong',
    'Grace', 'Henry', 'Olivia', 'James', 'Emma', 'Daniel', 'Ava', 'Samuel', 'Ruby', 'Jack',
    'Ines', 'Rafael', 'Clara', 'Andre', 'Lucia', 'Pedro', 'Marisol', 'Javier', 'Ana', 'Nico',
    'Sora', 'Jin', 'Min-ji', 'Hiro', 'Linh', 'Bao', 'Anh', 'Wei', 'Lan', 'Tae',
    'Fatima', 'Yusuf', 'Nour', 'Kofi', 'Ama', 'Tariq', 'Dev', 'Asha', 'Ravi', 'Meera'
  ];

  const homes = [
    'Barkada', 'Roomies', 'The Smith family', 'Casa Reyes', 'The Nakamura home', 'Us two', 'Maple St. roommates', 'The Garcia crew', 'Apartment 4B', 'The Patel family',
    'Bahay Kubo', 'The Santos family', 'Lola’s house', 'The Cruz household', 'Dorm room 12', 'The Kims', 'Home sweet home', 'The Lopez family', 'Cozy corner', 'The Nguyens',
    'Barkada house', 'The Okafor family', 'Sunny flat', 'The Murphys', 'Beach house crew', 'The Silva family', 'The roommates', 'Our little home', 'The Chens', 'Casa Luna',
    'The Johnsons', 'Third floor friends', 'The Dela Cruz family', 'Mom and me', 'The Wilsons', 'The Rossi family', 'Pine Street house', 'The Ahmeds', 'Two cats and us', 'The Müller family',
    'The Tanaka home', 'Fam bam', 'The Bautistas', 'Basement suite', 'The Martins', 'Casa Verde', 'The Abebe family', 'The Mendozas', 'Lake house', 'Our nest',
    'The Kowalskis', 'Grad school flat', 'The Ramos family', 'The O’Briens', 'Big family', 'The Hassans', 'Cedar Lane', 'The Villanuevas', 'Weekend house', 'The Fischers',
    'The Lees', 'Downtown loft', 'The Aquinos', 'The Brown family', 'Tiny house', 'The Delgados', 'The Singhs', 'Farmhouse', 'The Tran family', 'The Andersons',
    'Bayanihan house', 'The Castillos', 'The Moores', 'Corner unit', 'The Yamamotos', 'Studio friends', 'The Torres family', 'The Haddads', 'Garden flat', 'The Navarros',
    'Sisters’ place', 'The Taylors', 'The Flores family', 'Hilltop home', 'The Ivanovs', 'The Pascuals', 'Co-op house', 'The Clarks', 'The Mehtas', 'River house',
    'The Domingos', 'The Walkers', 'Cabin crew', 'The Herreras', 'The Sato family', 'Uncle’s house', 'The Ocampos', 'The Evans family', 'Townhouse 7', 'The Lims'
  ];

  const trips = [
    'Japan 2027', 'Boracay summer', 'Grandma’s 80th in Cebu', 'Road trip to Banff', 'Spain and Portugal', 'Disney with the kids', 'Barkada beach weekend', 'Honeymoon in Bali', 'Seoul food trip', 'Christmas in Manila',
    'Camping at the lake', 'New York long weekend', 'Palawan island hopping', 'Rome and Florence', 'Ski week in Whistler', 'Family reunion 2027', 'Hawaii getaway', 'Iceland ring road', 'Taipei night markets', 'Paris for two',
    'Siargao surf trip', 'Mexico City eats', 'Vancouver Island drive', 'Kyoto in spring', 'Lisbon and Porto', 'Baguio cool-off', 'Thailand backpacking', 'London and Edinburgh', 'Cruise to Alaska', 'Vegas birthday',
    'Hong Kong stopover', 'Singapore and Malaysia', 'Bohol with Lola', 'Greek islands', 'Toronto wedding', 'Banaue rice terraces', 'Vietnam north to south', 'Costa Rica adventure', 'Amsterdam by bike', 'Ilocos road trip',
    'Okinawa beaches', 'Disneyland Tokyo', 'Patagonia hike', 'Cebu whale sharks', 'Montreal winter', 'Yosemite camping', 'Swiss Alps train', 'Batanes with friends', 'Dubai stopover', 'Prague and Vienna',
    'Graduation trip', 'Coron diving', 'Seattle weekend', 'Moroccan desert', 'Davao durian trip', 'California coast', 'Bucket list Peru', 'Phuket with the barkada', 'Berlin long weekend', 'Sagada hike',
    'Anniversary in Paris', 'Kids’ first flight', 'Hokkaido snow', 'Nashville music trip', 'La Union surf', 'Croatia sailing', 'Quebec City Christmas', 'Jeju Island', 'Scottish Highlands', 'Dumaguete chill',
    'Cancun all-in', 'Chicago food crawl', 'Bangkok shopping', 'Tagaytay day trip', 'Norway fjords', 'Grand Canyon drive', 'Kenya safari', 'El Nido sunsets', 'Osaka eats', 'Puerto Rico beaches',
    'Mom’s 60th in Cebu', 'Dad’s retirement trip', 'Family cruise 2027', 'Girls’ trip to Bali', 'Boys’ golf weekend', 'Team retreat', 'Spring break', 'Summer at Lola’s', 'Holy Week in Vigan', 'New Year in Sydney',
    'Tokyo marathon', 'Wedding in Boracay', 'Iloilo food trip', 'Napa wine weekend', 'Bucharest and Budapest', 'Aurora borealis', 'Galápagos', 'Cappadocia balloons', 'Camiguin island', 'Maldives escape'
  ];

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  PL.examples = { names, homes, trips, name: () => pick(names), home: () => pick(homes), trip: () => pick(trips) };
})();
