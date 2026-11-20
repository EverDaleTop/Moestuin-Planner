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
DATA_STORE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=GEBRUIKER_oogstplan
DB_USER=GEBRUIKER_oogstplan
DB_PASSWORD=je-sterke-wachtwoord
```

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

Kopieer `.env.example` naar `.env` en zet je lokale databasegegevens erin:

```env
DATA_STORE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=oogstplan_lokaal
DB_USER=root
DB_PASSWORD=
```

Dan:

```bash
npm install
npm run dev
```

De frontend draait via Vite en de server automatisch op poort 3001.

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
