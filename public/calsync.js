// Apple Kalender-abonnement: en personlig .ics-lenke som Kalender-appen
// henter på nytt av seg selv. Lastes etter app.js og bruker state, api,
// setState, render og showToast derfra.

function calFeedUrls() {
  const feed = state && state.calendarFeed;
  if (!feed) return null;
  const https = `${location.protocol}//${location.host}${feed.path}`;
  return { https, webcal: https.replace(/^https?:/, 'webcal:') };
}

function renderCalSync() {
  const urls = calFeedUrls();
  document.getElementById('cal-sync-off').hidden = !!urls;
  document.getElementById('cal-sync-on').hidden = !urls;
  document.getElementById('cal-sync-hint').textContent = urls
    ? 'Trykk «Abonner» på iPhonen eller Macen. Kalenderen oppdaterer seg selv etter hvert. Lenken er personlig – ikke del den.'
    : 'Få oppgavene dine automatisk inn i Apple Kalender – én samlet hendelse per dag.';
  if (urls) document.getElementById('cal-sync-subscribe').href = urls.webcal;
}

async function createCalFeed() {
  try {
    setState(await api('/api/calendar-feed', { method: 'POST' }));
    render();
  } catch (err) {
    showToast(err.message);
  }
}

document.getElementById('cal-sync-connect').addEventListener('click', createCalFeed);

document.getElementById('cal-sync-reset').addEventListener('click', async () => {
  if (!confirm('Lage en ny lenke? Den gamle slutter å virke, og du må abonnere på nytt (slett det gamle abonnementet i Kalender).')) return;
  await createCalFeed();
  showToast('Ny lenke laget – trykk «Abonner» igjen.');
});

document.getElementById('cal-sync-copy').addEventListener('click', async () => {
  const urls = calFeedUrls();
  if (!urls) return;
  try {
    await navigator.clipboard.writeText(urls.https);
    showToast('Lenken er kopiert.');
  } catch (err) {
    window.prompt('Kopier lenken:', urls.https);
  }
});

// Kobler renderCalSync() inn i render() fra app.js.
const renderWithoutCalSync = render;
render = function renderWithCalSync() {
  renderWithoutCalSync();
  if (state) renderCalSync();
};
