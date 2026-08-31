# DISIPLIN.

En gamifisert dagsplanlegger: du legger opp planen for i morgen *kvelden før*, følger
den opp i løpet av dagen, og avslutter med en kort kveldsrefleksjon. Det gir XP,
bygger en streak og lever opp kjæledyret ditt.

## Kom i gang

Du trenger [Node.js](https://nodejs.org) (versjon 18 eller nyere). Ingen andre
avhengigheter kreves — appen bruker kun det som følger med Node.

```bash
node server.js
```

Åpne deretter <http://localhost:3000> i nettleseren.

Vil du bruke en annen port:

```bash
PORT=4000 node server.js
```

## Hvordan det fungerer

- **Planlegg i morgen** — legg til oppgaver for neste dag i seksjonen til høyre.
  Dette er selve kveldsritualet.
- **I dag** — huk av oppgaver etter hvert som du gjør dem. Du kan også legge
  til nye oppgaver direkte på dagen selv, ikke bare kvelden før — de teller
  bare ikke med på "planla kvelden før"-bonusen siden de ikke var planlagt
  i forveien.
- **Endre rekkefølge** — bruk ▲▼-knappene på en oppgave for å flytte den opp
  eller ned i listen, både for dagens oppgaver og morgendagens plan.
- **Kalender** — legg inn ting flere dager (eller uker) fram i tid i
  Kalender-kortet. Oppgaven dukker automatisk opp i "I dag" den dagen det
  gjelder, akkurat som om du hadde planlagt den kvelden før — den eneste
  forskjellen er at den ikke teller med på "planla kvelden før"-bonusen med
  mindre du faktisk la den inn dagen før.
- **Fullfør dagen** — når dagen er over, gi den en vurdering (1–10 stjerner) og
  skriv gjerne noen tanker. Dette låser dagen og regner ut XP.
- **XP og nivå** — du får poeng for fullførte oppgaver, fullføringsgrad,
  selve refleksjonen, og en bonus for å ha planlagt kvelden før.
- **Inaktivitet koster** 😴 — for hver hele dag du ikke avslutter med en
  kveldsrefleksjon, trekkes det 15 XP (kan ikke gå under 0). Dette gjøres
  automatisk neste gang appen åpnes, uansett hvor mange dager det har gått,
  så fremgangen din blir flytende i begge retninger — ikke bare voksende.
  Ingen straff for dager før du begynte å bruke appen.
- **Streak** 🔥 — teller sammenhengende dager der du gjennomfører
  kveldsrefleksjonen, uansett når du planla oppgavene. Hopper du over en
  dag brytes streaken og starter på 1 igjen neste gang du avslutter en dag.
  Planlegger du kvelden før får du i tillegg en fast bonus på **+5 XP** —
  dette påvirker ikke selve streaken lenger.
- **Kjæledyret** — utvikler seg fra egg til drage basert på nivået ditt, og
  humøret speiler streaken og hvor aktiv du har vært.
- **Dager og uker** — en sidekolonne ved siden av 14-dagers-oversikten viser
  hver dag med sjekklisten og stjernevurderingen din. Uker vises som faner —
  trykk på en for å slå den ut og se dagene i den uken. Hver uke har det
  faktiske ukenummeret som overskrift, og et snitt av stjernevurderingen
  (summen av alle dagers vurdering delt på antall vurderte dager).

## Leaderboard

Nederst i appen vises en rangering av alle som har konto på deres instans,
sortert etter total XP (og streak som utslagsgivende ved likt XP). Alle ser
alles nivå, XP og streak — men ikke oppgavene eller refleksjonene deres,
det holdes privat.

## Kontoer og familie

Innlogging fungerer som på Netflix: du møtes av en profilvelger med alle
som har opprettet en profil, pluss en egen "Ny bruker"-flis. Trykker du på
"Ny bruker" skriver du inn navnet ditt og lager en 4-sifret kode (skrives
inn to ganger for å bekrefte) — den koden bruker du for å låse opp profilen
din ved senere besøk. Ingen passord eller brukernavn å holde styr på, og
ingen faste plasser — hvem som helst i familien kan opprette sin egen
profil når de vil. To profiler kan ikke ha samme navn.

Hver person får sin egen XP, streak, kjæledyr og oppgaveliste — helt
adskilt fra resten av familien. Man kan bytte fargetema for sin egen
profil oppe til høyre (Samurai, Hav, Skog, Solnedgang) — alle bygget rundt
samme varme papir-stil som logoen, bare med ulik fargeklang.

**Glemt kode?** Det finnes ingen "glemt kode"-knapp i appen. Går det galt
må dere nullstille koden manuelt i databasen (se under) — eller rett og
slett opprette en ny profil med et annet navn.

## Data

Lokalt lagres alt i `data/db.json` — en enkel JSON-fil, ingen database
kreves. Slett filen for å nullstille alt fra scratch (eller ta en kopi av
den som backup).

Når appen er hostet i skyen (se under) brukes i stedet en ekte Postgres-
database automatisk, siden gratis hosting-tjenester ikke lar deg lagre
filer permanent.

**Glemt kode?** Koden lagres som et hash (samme prinsipp som passord),
så den kan ikke leses eller settes til noe kjent direkte i databasen. Det
enkleste er å slette profilen og opprette den på nytt via Neon sitt
**SQL Editor** (bytt ut navnet med det som glemte koden):

```sql
DELETE FROM profiles WHERE name = 'Marius';
```

Vær obs på at dette også sletter all fremgang (XP, streak, oppgaver) for
den profilen, siden dataene er knyttet til den. Er det viktig å beholde
fremgangen ved en glemt kode, si ifra, så bygger vi heller en ordentlig
"glemt kode"-funksjon inn i selve appen.

## Få den som en app på telefonen (gratis hosting)

For å nå DISIPLIN. fra telefonen din trenger den et sted å bo som er oppe
hele tiden. Oppsettet under er **gratis for evig** (ingen kredittkort), og
tar ca. 15 minutter:

**1. Opprett en gratis database (Neon)**

- Gå til [neon.com](https://neon.com) → opprett konto → nytt prosjekt.
- Kopier "Connection string" (starter med `postgresql://...`, inneholder
  `?sslmode=require`). Denne trenger du i steg 3.

**2. Legg koden på GitHub**

- Opprett et nytt (privat er fint) repo på [github.com/new](https://github.com/new).
- Last opp alle filene i denne mappen — enten via git:
  ```bash
  cd disiplin
  git init
  git add .
  git commit -m "DISIPLIN."
  git branch -M main
  git remote add origin <URL-en til ditt nye repo>
  git push -u origin main
  ```
  eller via "uploading an existing file" i GitHub sitt nettgrensesnitt hvis
  du ikke bruker git fra terminalen (dra hele mappeinnholdet inn).

**3. Deploy på Render**

- Gå til [render.com](https://render.com) → logg inn med GitHub.
- New → Blueprint → velg repoet ditt. Render finner `render.yaml` i
  repoet automatisk og setter opp alt.
- Den spør etter verdien for `DATABASE_URL` — lim inn connection-stringen
  fra Neon (steg 1).
- Legg gjerne til en miljøvariabel til under **Environment** (valgfritt,
  men anbefalt): `SESSION_SECRET` — en tilfeldig lang tekststreng du finner
  på (f.eks. `pxK9...`, hva som helst går). Uten denne blir alle logget ut
  hver gang tjenesten restarter/redeployer.
- Deploy. Etter et par minutter får du en URL som
  `https://disiplin-xxxx.onrender.com`.

**Verdt å vite:** gratis Render-tjenester "sovner" etter 15 minutter uten
trafikk, og bruker da ca. 1 minutt på å våkne igjen ved neste besøk. Helt
greit for en personlig app du sjekker morgen og kveld — bare vær
forberedt på at første åpning kan føles litt treg. Selve dataene dine er
trygge uansett, siden de ligger i Neon-databasen, ikke i selve
Render-tjenesten.

**4. Legg den til på hjemskjermen**

- Åpne Render-URL-en din i Safari (iPhone) eller Chrome (Android) på
  telefonen.
- iPhone: trykk Del-ikonet → "Legg til på Hjem-skjerm".
- Android: trykk meny (⋮) → "Legg til på startskjermen" / "Installer app".

Nå har du et app-ikon som åpner DISIPLIN. i fullskjerm, uten adressefelt —
akkurat som en ekte app.

## Bygge videre

Koden er delt i:

- `server.js` — HTTP-server og API-endepunkter
- `lib/auth.js` — kode-hashing (PIN) og innloggingssesjoner (kun Node sin
  innebygde crypto, ingen ekstra avhengigheter)
- `lib/db.js` — lagring: lokal fil som standard, Postgres når
  `DATABASE_URL` er satt (brukes automatisk ved sky-hosting). Profiler
  (åpen registrering) og hver persons dagsplan-data.
- `lib/themes.js` — liste over tilgjengelige fargetemaer
- `lib/dates.js` — datohjelpere (tidssone Europe/Oslo)
- `lib/gamification.js` — all spilllogikk (XP, nivå, streak, kjæledyr)
- `public/` — frontend (ren HTML/CSS/JS, ingen rammeverk) + innloggings-
  skjerm, temavelger, PWA-manifest og app-ikoner
- `render.yaml` — Render Blueprint for ett-klikks deploy

Naturlige neste steg: flere gamification-lag (badges/achievements), mulighet
til å etterregistrere en glemt dag, eller kategorier/prioritet på oppgaver.
