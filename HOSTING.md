# Hosten op mijn.host / DirectAdmin + lokaal ontwikkelen

De app gebruikt dezelfde code lokaal en op de hosting. Alleen de omgevings­variabelen verschillen. De server kiest de opslag via `DATA_STORE`.

## 1. Database aanmaken in DirectAdmin

1. Log in op DirectAdmin.
2. Ga naar **MySQL Management**.
3. Maak een database aan, bijvoorbeeld `oogstplan`.
4. Maak een databasegebruiker aan met een sterk wachtwoord.
5. Koppel de gebruiker aan de database met **alle rechten** op die database.
6. Noteer:
   - databasenaam (vaak met accountprefix, bijvoorbeeld `gebruiker_oogstplan`);
   - gebruikersnaam (bijvoorbeeld `gebruiker_oogstplan`);
   - wachtwoord;
   - host: meestal `localhost`.

De tabellen hoef je niet handmatig aan te maken. De server doet dat bij de eerste start automatisch met `CREATE TABLE IF NOT EXISTS`. Bij latere starts gebeurt er niets meer.

## 2. Node.js-app aanmaken

1. Ga in DirectAdmin naar **Extra Features → Setup Node.js App**.
2. Kies **Create Application**.
3. Kies Node.js 20 of 22.
4. Application root: de map waar de app komt, bijvoorbeeld:
   `/home/GEBRUIKER/domains/JOUWDOMEIN.nl/app`
5. Application URL: je domein of subdomein.
6. Application startup file: `build/server.cjs`.
7. Voeg deze environment variables toe:

```env
NODE_ENV=production
APP_URL=https://oogstplan.nl
DATA_STORE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=GEBRUIKER_oogstplan
DB_USER=GEBRUIKER_oogstplan
DB_PASSWORD=je-sterke-wachtwoord
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```

`VITE_GOOGLE_CLIENT_ID` is nodig tijdens `npm run build`; de frontend neemt hem mee de build in.

### Google-login

De app gebruikt directe Google-login via Google Identity Services, zonder Supabase Auth.

Zet in Google Cloud Console bij je OAuth Client ID (type Web):

- **Authorized JavaScript origins:** `https://oogstplan.nl`
- voor lokaal testen ook: `http://localhost:5173`

Een redirect-URI is hiervoor niet nodig. De **client secret** is voor deze
ID-token-login ook niet nodig; bewaar die veilig en zet hem nooit in een
`VITE_`-variabele of in de frontend.

Staat de OAuth-consent screen nog op **Testing**? Voeg dan je testaccounts toe
als test user, of publiceer de app. Anders kunnen alleen test users inloggen.

Laat `PORT` leeg; DirectAdmin/Passenger geeft die meestal zelf door. Werkt de app niet, zet dan `PORT=3001`.

## 3. Code op de server zetten

Bij voorkeur via SSH:

```bash
cd /home/GEBRUIKER/domains/JOUWDOMEIN.nl/app
git clone https://github.com/EverDaleTop/Moestuin-Planner.git .
npm ci
npm run build
npm run build:server
```

Daarna in DirectAdmin de Node-app herstarten.

Bij een update:

```bash
git pull
npm ci
npm run build
npm run build:server
```

En opnieuw herstarten via DirectAdmin.

## 4. Controleren of de tabellen gemaakt zijn

Na de eerste start zou de app moeten loggen:

```text
Data: MySQL (GEBRUIKER_oogstplan)
```

Je kunt optioneel handmatig initialiseren:

```bash
npm run db:init
```

Daarna staan deze tabellen in de database:

- `users`
- `sessions`
- `gardens`
- `garden_members`
- `app_state`

## 5. Bestaande data overzetten

### Van lokale JSON

```bash
SOURCE_STORE=json DATA_FILE=./data/db.json npm run db:migrate
```

### Van Supabase

```bash
SOURCE_STORE=supabase \
SUPABASE_URL=https://jouw-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run db:migrate
```

De migratie vult dezelfde MySQL-database die in `.env` staat. Maak eerst een backup.

## 6. Lokaal ontwikkelen

Lokaal blijft de app standaard Supabase als data-opslag gebruiken. Dat staat in `.env`:

```env
DATA_STORE=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

In `.env.local` staat alleen de Google Client ID voor de frontend:

```env
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```

Dan:

```bash
npm install
npm run dev
```

De frontend draait via Vite en de server automatisch op poort 3001.

Wil je lokaal toch MySQL testen, zet dan in `.env`:

```env
DATA_STORE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=oogstplan_lokaal
DB_USER=root
DB_PASSWORD=
```

### Lokaal tegen de productiedatabase

Dit kan, maar elke wijziging is direct live. Gebruik bij voorkeur een SSH-tunnel:

```bash
ssh -N -L 3307:127.0.0.1:3306 GEBRUIKER@JOUWDOMEIN.nl
```

Zet lokaal in `.env`:

```env
DB_HOST=127.0.0.1
DB_PORT=3307
```

Gebruik dit alleen voor debuggen. Voor normale ontwikkeling kun je beter een lokale kopie van de database maken met `mysqldump` en die lokaal importeren.

## 7. Belangrijk

- Zet poort 3306 nooit openbaar open.
- Gebruik geen MySQL-rootaccount voor de app.
- Maak vooraf een backup van bestaande data.
- Test na deployment: inloggen, tuin openen, taak toevoegen, pagina verversen en de server herstarten.
- WebSockets voor live samenwerken worden door DirectAdmin/Node ondersteund, maar test dit na de eerste deployment.
