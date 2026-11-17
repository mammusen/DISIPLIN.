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
];

// Dagens forslag er det samme hele dagen; «Gi meg en ny» trekker tilfeldig.
function dayIndex(dateStr, len, salt) {
  let h = salt;
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % len;
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
    motivQuote = dayIndex(today, QUOTES.length, 7);
    motivSong = dayIndex(today, SONGS.length, 13);
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

// Koble fanen og visningen inn i app.js. (Appen åpner aldri rett på denne
// fanen ved oppstart - da starter den på «I dag» som vanlig.)
TABS.push('motivation');

const renderWithoutMotivation = render;
render = function renderWithMotivation() {
  renderWithoutMotivation();
  if (state) renderMotivation();
};
