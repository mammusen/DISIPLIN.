// "Motivasjon"-fanen: et sitat, et sangforslag og en liten startoppgave for
// de dagene det butter. Alt ligger her i klienten - ingen server trengs.
// Lastes etter app.js og bruker state, render, showTab og TABS derfra.

const QUOTES = [
  { text: 'Det vanskelige er det som tar litt tid; det umulige er det som tar litt lengre tid.', by: 'Fridtjof Nansen' },
  { text: 'Seier venter den som har alt i orden – flaks kaller folk det.', by: 'Roald Amundsen' },
  { text: 'Discipline is the bridge between goals and accomplishment.', by: 'Jim Rohn' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', by: 'Robert Collier' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', by: 'James Clear' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', by: 'Will Durant' },
  { text: 'Start where you are. Use what you have. Do what you can.', by: 'Arthur Ashe' },
  { text: 'First say to yourself what you would be; and then do what you have to do.', by: 'Epiktet' },
  { text: 'While we are postponing, life speeds by.', by: 'Seneca' },
  { text: 'It is not that we have a short time to live, but that we waste a lot of it.', by: 'Seneca' },
  { text: 'Waste no more time arguing about what a good man should be. Be one.', by: 'Marcus Aurelius' },
  { text: 'A journey of a thousand miles begins with a single step.', by: 'Lao Tzu' },
  { text: "Don't quit. Suffer now and live the rest of your life as a champion.", by: 'Muhammad Ali' },
  { text: 'It always seems impossible until it’s done.', by: 'Tilskrevet Nelson Mandela' },
  { text: 'The secret of getting ahead is getting started.', by: 'Tilskrevet Mark Twain' },
  { text: 'Motivation gets you going, but discipline keeps you growing.', by: 'Tilskrevet John C. Maxwell' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', by: 'Kinesisk ordtak' },
  { text: 'Fall seven times, stand up eight.', by: 'Japansk ordtak' },
  { text: "Hard work beats talent when talent doesn't work hard.", by: 'Tim Notke' },
  { text: 'Well done is better than well said.', by: 'Benjamin Franklin' },
  { text: 'Energy and persistence conquer all things.', by: 'Benjamin Franklin' },
  { text: 'No man is free who is not master of himself.', by: 'Epiktet' },
  { text: 'He who has a why to live can bear almost any how.', by: 'Friedrich Nietzsche' },
  { text: 'Small deeds done are better than great deeds planned.', by: 'Peter Marshall' },
  { text: "Don't count the days, make the days count.", by: 'Tilskrevet Muhammad Ali' },
  { text: 'If you are going through hell, keep going.', by: 'Tilskrevet Winston Churchill' },
  { text: "Whether you think you can, or you think you can't – you're right.", by: 'Tilskrevet Henry Ford' },
  { text: 'The man who moves a mountain begins by carrying away small stones.', by: 'Tilskrevet Konfucius' },
  { text: 'Do the hard jobs first. The easy jobs will take care of themselves.', by: 'Tilskrevet Dale Carnegie' },
];

const SONGS = [
  { title: 'Lose Yourself', artist: 'Eminem' },
  { title: "'Till I Collapse", artist: 'Eminem' },
  { title: 'Eye of the Tiger', artist: 'Survivor' },
  { title: 'Remember the Name', artist: 'Fort Minor' },
  { title: "Can't Hold Us", artist: 'Macklemore & Ryan Lewis' },
  { title: 'Stronger', artist: 'Kanye West' },
  { title: 'Power', artist: 'Kanye West' },
  { title: 'Hall of Fame', artist: 'The Script, will.i.am' },
  { title: 'Believer', artist: 'Imagine Dragons' },
  { title: 'Thunderstruck', artist: 'AC/DC' },
  { title: 'HUMBLE.', artist: 'Kendrick Lamar' },
  { title: 'Not Afraid', artist: 'Eminem' },
  { title: 'Seven Nation Army', artist: 'The White Stripes' },
  { title: "Don't Stop Me Now", artist: 'Queen' },
  { title: 'The Final Countdown', artist: 'Europe' },
  { title: 'Titanium', artist: 'David Guetta, Sia' },
  { title: 'Centuries', artist: 'Fall Out Boy' },
  { title: 'Sail', artist: 'AWOLNATION' },
  { title: "X Gon' Give It To Ya", artist: 'DMX' },
  { title: 'Run This Town', artist: 'JAY-Z, Rihanna, Kanye West' },
  { title: 'Survivor', artist: "Destiny's Child" },
  { title: 'Mr. Brightside', artist: 'The Killers' },
  { title: 'Kickstart My Heart', artist: 'Mötley Crüe' },
  { title: "Can't Stop", artist: 'Red Hot Chili Peppers' },
  { title: 'Uprising', artist: 'Muse' },
  { title: 'Numb / Encore', artist: 'JAY-Z, Linkin Park' },
  { title: 'Godzilla', artist: 'Eminem, Juice WRLD' },
  { title: 'SICKO MODE', artist: 'Travis Scott' },
  { title: 'Jump', artist: 'Van Halen' },
  { title: 'Welcome to the Jungle', artist: "Guns N' Roses" },
  { title: 'Back in Black', artist: 'AC/DC' },
  { title: 'Born to Run', artist: 'Bruce Springsteen' },
  { title: 'Gonna Fly Now', artist: 'Bill Conti' },
  { title: 'On Top of the World', artist: 'Imagine Dragons' },
  { title: 'Levels', artist: 'Avicii' },
  { title: 'The Nights', artist: 'Avicii' },
  { title: 'Wake Me Up', artist: 'Avicii' },
  { title: 'Firestone', artist: 'Kygo, Conrad Sewell' },
  { title: 'Midnight City', artist: 'M83' },
  { title: 'Higher Ground', artist: 'Red Hot Chili Peppers' },
];

// Nytt sitat og ny sang hver dag (skifter når dagen skifter kl. 04). Listene
// går i rekkefølge dag for dag, så ingenting gjentas før hele lista er brukt.
// «Gi meg en ny» trekker tilfeldig.
function dayIndex(dateStr, len) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return dayNumber % len;
}

function randomOther(len, current) {
  if (len < 2) return 0;
  let i = current;
  while (i === current) i = Math.floor(Math.random() * len);
  return i;
}

let motivQuote = null;
let motivSong = null;
let motivDate = null;

function renderMotivation() {
  const today = state.today.date;
  if (motivDate !== today) {
    motivDate = today;
    motivQuote = dayIndex(today, QUOTES.length);
    motivSong = dayIndex(today, SONGS.length);
  }

  const q = QUOTES[motivQuote];
  document.getElementById('motiv-quote-text').textContent = `«${q.text}»`;
  document.getElementById('motiv-quote-by').textContent = `– ${q.by}`;

  const s = SONGS[motivSong];
  document.getElementById('motiv-song-title').textContent = s.title;
  document.getElementById('motiv-song-artist').textContent = s.artist;
  const query = encodeURIComponent(`${s.title} ${s.artist}`);
  document.getElementById('motiv-spotify').href = `https://open.spotify.com/search/${query}`;
  document.getElementById('motiv-apple').href = `https://music.apple.com/no/search?term=${query}`;

  // Liten start: første oppgave i dag som ikke er gjort.
  const next = state.today.reflection ? null : state.today.tasks.find((t) => !t.done);
  const start = document.getElementById('motiv-start');
  if (next) {
    start.hidden = false;
    document.getElementById('motiv-start-task').textContent = next.title;
  } else {
    start.hidden = true;
  }
}

document.getElementById('motiv-new').addEventListener('click', () => {
  motivQuote = randomOther(QUOTES.length, motivQuote);
  motivSong = randomOther(SONGS.length, motivSong);
  renderMotivation();
  const card = document.getElementById('motiv-card');
  card.classList.remove('motiv-pop');
  void card.offsetWidth; // start animasjonen på nytt
  card.classList.add('motiv-pop');
});

document.getElementById('motiv-go').addEventListener('click', () => showTab('today'));

// Står appen åpen over natta, hentes ny tilstand (og dermed dagens sitat)
// når du går tilbake til den.
let motivLastCheck = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state) return;
  if (Date.now() - motivLastCheck < 10 * 60 * 1000) return;
  motivLastCheck = Date.now();
  refresh();
});

// Koble fanen og visningen inn i app.js. (Appen åpner aldri rett på denne
// fanen ved oppstart - da starter den på «I dag» som vanlig.)
TABS.push('motivation');

const renderWithoutMotivation = render;
render = function renderWithMotivation() {
  renderWithoutMotivation();
  if (state) renderMotivation();
};
