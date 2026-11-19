import { useEffect } from "react";
import { Navbar } from "./Navbar";
import { LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "./useTheme";
import { LEGAL_INFO, LEGAL_UPDATED } from "./legal";
import type { LegalPageKind } from "./legalRoutes";
import "./App.css";

const PAGE_TITLES: Record<LegalPageKind, string> = {
  privacy: "Privacybeleid",
  voorwaarden: "Gebruiksvoorwaarden",
  cookies: "Cookieverklaring",
};

const PAGE_EYEBROWS: Record<LegalPageKind, string> = {
  privacy: "Privacy",
  voorwaarden: "Voorwaarden",
  cookies: "Cookies",
};

function ContactBlock() {
  return (
    <div className="legal-contact">
      <h3>Contact</h3>
      <p>
        Vragen over dit document of over je gegevens? Mail naar{" "}
        <a href={`mailto:${LEGAL_INFO.email}`}>{LEGAL_INFO.email}</a>.
      </p>
    </div>
  );
}

function PrivacyContent() {
  return (
    <>
      <p className="legal-intro">
        Oogstplan helpt je om je moestuin te plannen en bij te houden. Daarvoor
        verwerken we een beperkte set persoonsgegevens. In dit beleid lees je
        welke gegevens dat zijn, waarom we ze gebruiken en welke rechten je hebt.
      </p>

      <section className="legal-section">
        <h2>1. Wie is verantwoordelijk?</h2>
        <p>
          Oogstplan wordt aangeboden door de beheerder van deze website. Wij zijn
          verwerkingsverantwoordelijke voor de gegevens die via deze site worden
          verwerkt. Vragen of verzoeken kun je sturen naar{" "}
          <a href={`mailto:${LEGAL_INFO.email}`}>{LEGAL_INFO.email}</a>.
        </p>
      </section>

      <section className="legal-section">
        <h2>2. Welke gegevens verwerken we?</h2>

        <h3>Accountgegevens</h3>
        <ul className="legal-list">
          <li>
            <strong>Gebruikersnaam en wachtwoord.</strong> Je wachtwoord bewaren
            we nooit leesbaar; het wordt versleuteld opgeslagen met bcrypt.
          </li>
          <li>
            <strong>E-mailadres, naam en profielfoto.</strong> Alleen als je met
            Google inlogt, ontvangen we die gegevens van Google. Je e-mailadres
            gebruiken we dan om je account te herkennen.
          </li>
          <li>
            <strong>Accountgegevens en sessies.</strong> Een uniek
            accountnummer, aanmaakdatum en technische sessietokens.
          </li>
        </ul>

        <h3>Tuingegevens</h3>
        <p>
          Alles wat je zelf invoert: tuinnamen, bedden, gewassen, zaai- en
          oogstmomenten, taken, notities, boodschappenlijsten en uitgaven of
          inkomsten. Uitgaven kunnen financiële informatie bevatten; deel die
          alleen met mensen die je vertrouwt.
        </p>

        <h3>Gegevens over samenwerking</h3>
        <p>
          Als je een tuin deelt, bewaren we wie toegang heeft en gebruiken we
          uitnodigingslinks. Andere deelnemers kunnen je gebruikersnaam en je
          wijzigingen in de gedeelde tuin zien.
        </p>

        <h3>Technische gegevens</h3>
        <ul className="legal-list">
          <li>
            Sessietokens en tijdstippen van je gebruik. Onze hostingpartij kan
            daarnaast je IP-adres en browsertype in technische logbestanden
            vastleggen, onder meer om misbruik en fouten op te sporen.
          </li>
          <li>
            Een online-status (wel of niet actief in een tuin) via een
            realtime-verbinding, zolang je de editor open hebt.
          </li>
          <li>
            Voorkeuren die lokaal in je browser worden bewaard, zoals thema en
            de laatste tuin die je opende. Zie de{" "}
            <a href="/cookies">cookieverklaring</a>.
          </li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>3. Waarvoor gebruiken we je gegevens?</h2>
        <ul className="legal-list">
          <li>
            <strong>Om de dienst te leveren</strong> (account, tuinen, delen en
            synchroniseren). Grondslag: uitvoering van de overeenkomst.
          </li>
          <li>
            <strong>Om de dienst veilig en betrouwbaar te houden</strong>
            (foutopsporing, misbruikpreventie, beveiliging). Grondslag:
            gerechtvaardigd belang.
          </li>
          <li>
            <strong>Voor Google-login</strong>, als je daar zelf voor kiest.
            Grondslag: jouw toestemming en de uitvoering van de overeenkomst.
          </li>
          <li>
            <strong>Om aan de wet te voldoen</strong>, bijvoorbeeld bij een
            wettelijke bewaarplicht of een geldig verzoek van een bevoegde
            instantie.
          </li>
        </ul>
        <p>
          We gebruiken je gegevens niet voor advertenties, profilering of
          geautomatiseerde besluitvorming met rechtsgevolgen.
        </p>
      </section>

      <section className="legal-section">
        <h2>4. Hoe lang bewaren we gegevens?</h2>
        <ul className="legal-list">
          <li>
            Account- en tuingegevens bewaren we zolang je account bestaat. Na
            verwijdering van je account verwijderen we deze gegevens, tenzij we
            ze wettelijk nog moeten bewaren.
          </li>
          <li>
            Sessies verlopen automatisch na 30 dagen of eerder als je uitlogt.
          </li>
          <li>
            Technische logbestanden bewaren we zo kort als nodig is voor
            beveiliging en foutopsporing.
          </li>
        </ul>
        <p>
          Je account verwijderen? Mail naar{" "}
          <a href={`mailto:${LEGAL_INFO.email}`}>{LEGAL_INFO.email}</a>. We
          handelen je verzoek binnen 30 dagen af.
        </p>
      </section>

      <section className="legal-section">
        <h2>5. Met wie delen we gegevens?</h2>
        <p>
          We verkopen je gegevens niet. We gebruiken alleen dienstverleners die
          nodig zijn om Oogstplan te laten werken:
        </p>
        <ul className="legal-list">
          <li>
            <strong>Supabase</strong> voor de database en, indien ingeschakeld,
            authenticatie via Google.
          </li>
          <li>
            <strong>Google</strong> als je met je Google-account inlogt. Google
            verwerkt daarbij je inloggegevens volgens zijn eigen voorwaarden.
          </li>
          <li>
            <strong>Onze hostingpartij</strong> voor hosting van de website en
            de server.
          </li>
        </ul>
        <p>
          Deze partijen verwerken gegevens in onze opdracht of op basis van hun
          eigen verantwoordelijkheid. Met verwerkers sluiten we waar nodig een
          verwerkersovereenkomst.
        </p>
        <p>
          Google kan gegevens buiten de Europese Economische Ruimte verwerken.
          Daarvoor gelden de waarborgen die Google daarvoor biedt, zoals
          standaardcontractbepalingen of een adequaatheidsbesluit. Supabase
          draait in de datacenterregio die voor dit project is ingesteld.
        </p>
      </section>

      <section className="legal-section">
        <h2>6. Cookies en lokale opslag</h2>
        <p>
          Oogstplan gebruikt geen marketing- of analysediensten en plaatst geen
          trackingcookies. We bewaren wel functionele gegevens in je browser,
          zoals je sessie en je themavoorkeur. Meer details staan in de{" "}
          <a href="/cookies">cookieverklaring</a>.
        </p>
      </section>

      <section className="legal-section">
        <h2>7. Hoe beveiligen we je gegevens?</h2>
        <p>
          We gebruiken versleutelde verbindingen (TLS), hashen wachtwoorden met
          bcrypt en beveiligen sessies met willekeurige tokens. Toegang tot de
          database is beperkt tot de server. Ondanks deze maatregelen kan geen
          enkele dienst absolute veiligheid garanderen.
        </p>
      </section>

      <section className="legal-section">
        <h2>8. Jouw rechten</h2>
        <p>Je hebt het recht om:</p>
        <ul className="legal-list">
          <li>je gegevens in te zien en een kopie te ontvangen;</li>
          <li>onjuiste gegevens te laten corrigeren;</li>
          <li>je gegevens of je account te laten verwijderen;</li>
          <li>de verwerking te beperken of er bezwaar tegen te maken;</li>
          <li>je gegevens in een overdraagbaar formaat te ontvangen;</li>
          <li>een gegeven toestemming weer in te trekken.</li>
        </ul>
        <p>
          Stuur je verzoek naar{" "}
          <a href={`mailto:${LEGAL_INFO.email}`}>{LEGAL_INFO.email}</a>. We
          kunnen je vragen om je identiteit te bevestigen. Ben je het niet eens
          met hoe we met je gegevens omgaan? Dan kun je een klacht indienen bij
          de{" "}
          <a
            href="https://www.autoriteitpersoonsgegevens.nl"
            target="_blank"
            rel="noreferrer"
          >
            Autoriteit Persoonsgegevens
          </a>
          .
        </p>
      </section>

      <section className="legal-section">
        <h2>9. Kinderen</h2>
        <p>
          Oogstplan is niet gericht op kinderen onder de 16 jaar. Maak alleen
          een account aan als je 16 jaar of ouder bent, of als je ouders of
          verzorgers daarvoor toestemming hebben gegeven.
        </p>
      </section>

      <section className="legal-section">
        <h2>10. Wijzigingen</h2>
        <p>
          We kunnen dit beleid aanpassen als de dienst verandert. De actuele
          versie staat altijd op deze pagina, met de datum van de laatste
          wijziging. Bij belangrijke wijzigingen laten we het je weten in de app.
        </p>
      </section>

      <ContactBlock />
    </>
  );
}

function TermsContent() {
  return (
    <>
      <p className="legal-intro">
        Deze voorwaarden gelden als je Oogstplan gebruikt. Door een account aan
        te maken of de app te gebruiken, ga je ermee akkoord. Lees ze rustig
        door; ze zijn bewust kort gehouden.
      </p>

      <section className="legal-section">
        <h2>1. De dienst</h2>
        <p>
          {LEGAL_INFO.productName} is een online hulpmiddel om een moestuin te
          plannen, bij te houden en met anderen te delen. De dienst is op dit
          moment gratis. We kunnen functies toevoegen, wijzigen of laten
          vervallen.
        </p>
        <p>
          De app geeft informatie over zaaien, oogsten en tuinieren als
          hulpmiddel. Die informatie is indicatief. Controleer belangrijke
          informatie zelf; het resultaat van je tuin hangt af van veel factoren
          die wij niet kunnen beïnvloeden.
        </p>
      </section>

      <section className="legal-section">
        <h2>2. Je account</h2>
        <ul className="legal-list">
          <li>
            Geef bij registratie juiste gegevens op en houd je gegevens actueel.
          </li>
          <li>
            Houd je wachtwoord geheim. Je bent verantwoordelijk voor activiteiten
            die via jouw account gebeuren, tenzij je ons tijdig meldt dat je
            account is misbruikt.
          </li>
          <li>
            Je moet minimaal 16 jaar zijn, of toestemming van je ouders of
            verzorgers hebben.
          </li>
          <li>
            Eén persoon per account. Deel je inloggegevens niet met anderen; gebruik
            daarvoor de deel- en uitnodigingsfunctie.
          </li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>3. Toegestaan gebruik</h2>
        <p>Het is niet toegestaan om:</p>
        <ul className="legal-list">
          <li>
            de dienst te gebruiken voor illegale doeleinden of in strijd met deze
            voorwaarden;
          </li>
          <li>
            gegevens van anderen te verzamelen, te misbruiken of zonder
            toestemming te publiceren;
          </li>
          <li>
            de beveiliging te omzeilen, de dienst te overbelasten of
            geautomatiseerd grootschalig uit te lezen;
          </li>
          <li>
            de software te reverse-engineeren of te kopiëren, behalve voor zover
            de wet dat toestaat;
          </li>
          <li>
            virussen, spam of andere schadelijke inhoud te verspreiden.
          </li>
        </ul>
        <p>
          Bij misbruik kunnen we je account tijdelijk of definitief blokkeren.
        </p>
      </section>

      <section className="legal-section">
        <h2>4. Inhoud die je zelf plaatst</h2>
        <p>
          Je blijft eigenaar van de gegevens die je invoert, zoals tuinen,
          gewassen, notities en uitgaven. Je geeft ons alleen de toestemming die
          nodig is om die gegevens op te slaan, te tonen en met door jou gekozen
          personen te delen, zolang je de dienst gebruikt.
        </p>
        <p>
          Je bent zelf verantwoordelijk voor de inhoud die je deelt en voor het
          verwijderen van gegevens die je niet meer wilt bewaren.
        </p>
      </section>

      <section className="legal-section">
        <h2>5. Tuinen delen</h2>
        <p>
          Met een uitnodigingslink geef je iemand toegang tot een tuin. Deel die
          link alleen met mensen die je vertrouwt. Je kunt toegang op elk moment
          intrekken via de deelinstellingen. Wat iemand al heeft gezien of
          gekopieerd, kunnen wij niet terugdraaien.
        </p>
      </section>

      <section className="legal-section">
        <h2>6. Beschikbaarheid en onderhoud</h2>
        <p>
          We doen ons best om Oogstplan beschikbaar en betrouwbaar te houden,
          maar we garanderen geen ononderbroken werking. De dienst kan tijdelijk
          niet beschikbaar zijn door onderhoud, storingen of factoren buiten onze
          invloed. We zijn niet aansprakelijk voor verlies van gegevens dat
          daardoor ontstaat; maak indien nodig je eigen kopieën van belangrijke
          informatie.
        </p>
      </section>

      <section className="legal-section">
        <h2>7. Intellectueel eigendom</h2>
        <p>
          De software, vormgeving, het logo en de merknaam van Oogstplan blijven
          eigendom van de beheerder van Oogstplan of de rechthebbenden. Je krijgt
          een beperkt, persoonlijk en niet-overdraagbaar recht om de dienst te
          gebruiken. Niets in deze voorwaarden draagt eigendom aan jou over.
        </p>
      </section>

      <section className="legal-section">
        <h2>8. Aansprakelijkheid</h2>
        <p>
          Voor zover de wet dit toestaat, is onze aansprakelijkheid beperkt tot
          directe schade die het gevolg is van een toerekenbare tekortkoming aan
          onze kant. We zijn niet aansprakelijk voor indirecte schade,
          gevolgschade, gederfde winst of verlies van gegevens, behalve bij opzet
          of bewuste roekeloosheid.
        </p>
        <p>
          Niets in deze voorwaarden beperkt aansprakelijkheid die op grond van
          dwingend recht niet mag worden beperkt, zoals bij letsel of overlijden
          door onze schuld.
        </p>
      </section>

      <section className="legal-section">
        <h2>9. Beëindiging</h2>
        <p>
          Je kunt op elk moment stoppen met het gebruik van Oogstplan en om
          verwijdering van je account vragen via{" "}
          <a href={`mailto:${LEGAL_INFO.email}`}>{LEGAL_INFO.email}</a>. Wij
          kunnen je account beëindigen bij ernstig of herhaald misbruik, of als
          we de dienst definitief stopzetten. Waar redelijk, laten we dat vooraf
          weten.
        </p>
      </section>

      <section className="legal-section">
        <h2>10. Wijzigingen</h2>
        <p>
          We kunnen deze voorwaarden aanpassen. De actuele versie staat op deze
          pagina. Bij ingrijpende wijzigingen informeren we je in de app. Blijf
          je de dienst daarna gebruiken, dan geldt de nieuwe versie.
        </p>
      </section>

      <section className="legal-section">
        <h2>11. Toepasselijk recht</h2>
        <p>
          Op deze voorwaarden is Nederlands recht van toepassing. Geschillen
          leggen we voor aan de bevoegde Nederlandse rechter, tenzij de wet een
          andere rechter verplicht stelt.
        </p>
      </section>

      <ContactBlock />
    </>
  );
}

function CookiesContent() {
  return (
    <>
      <p className="legal-intro">
        Oogstplan is zuinig met cookies. We gebruiken geen advertentie-,
        tracking- of analysediensten. Wat we wel opslaan, is strikt functioneel:
        zonder die opslag kun je niet ingelogd blijven of je voorkeuren bewaren.
      </p>

      <section className="legal-section">
        <h2>1. Geen trackingcookies</h2>
        <p>
          We plaatsen geen cookies van derden voor advertenties of statistieken.
          Naar onze inschatting is er daarom geen cookiebanner met een
          “accepteren”-knop nodig. De opslag hieronder valt onder de uitzondering
          voor strikt noodzakelijke en door jou gevraagde functionaliteit.
        </p>
      </section>

      <section className="legal-section">
        <h2>2. Wat we lokaal opslaan</h2>
        <p>
          De onderstaande gegevens staan in de <code>localStorage</code> van je
          browser, niet in een cookie van Oogstplan. Ze blijven bewaard tot je
          uitlogt, je browsergegevens wist of de app ze opruimt.
        </p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th>Sleutel</th>
                <th>Doel</th>
                <th>Bewaartermijn</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>mp_token</code>
                </td>
                <td>Ingelogd blijven (sessietoken).</td>
                <td>Tot uitloggen of maximaal 30 dagen.</td>
              </tr>
              <tr>
                <td>
                  <code>mp_gardens_cache_v1</code>
                </td>
                <td>Je tuinen sneller tonen bij het opstarten.</td>
                <td>Tot uitloggen of wissen van browsergegevens.</td>
              </tr>
              <tr>
                <td>
                  <code>mp-theme</code>
                </td>
                <td>Lichte of donkere weergave onthouden.</td>
                <td>Tot je browsergegevens wist.</td>
              </tr>
              <tr>
                <td>
                  <code>mp_last_garden</code>, <code>mp_profile_open</code>
                </td>
                <td>Laatste tuin en profielscherm onthouden.</td>
                <td>Tot je browsergegevens wist.</td>
              </tr>
              <tr>
                <td>
                  <code>mp_editor_tab</code>, <code>mp_snap</code>
                </td>
                <td>Laatste editor-tab en rastervoorkeur onthouden.</td>
                <td>Tot je browsergegevens wist.</td>
              </tr>
              <tr>
                <td>
                  <code>mp_notify_*</code>, <code>mp_notified_*</code>
                </td>
                <td>Meldingvoorkeuren en reeds getoonde meldingen per tuin.</td>
                <td>Tot je browsergegevens wist.</td>
              </tr>
              <tr>
                <td>
                  <code>sb-…-auth-token</code>
                </td>
                <td>
                  Sessie van Supabase, alleen als je met Google inlogt.
                </td>
                <td>Tot uitloggen of het verlopen van de sessie.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="legal-section">
        <h2>3. Google-login</h2>
        <p>
          Kies je voor “Verder met Google”, dan verloopt het inloggen via Google
          en Supabase. Daarbij kunnen Google en Supabase cookies of vergelijkbare
          opslag op hun eigen domeinen gebruiken. Daar gelden hun eigen
          cookie- en privacyverklaringen. Op het moment dat je niet met Google
          inlogt, laden we die diensten niet.
        </p>
      </section>

      <section className="legal-section">
        <h2>4. Zelf opruimen</h2>
        <p>
          Je kunt de opgeslagen gegevens verwijderen via de instellingen van je
          browser (meestal onder “Privacy” of “Sitegegevens”). Als je alleen je
          Oogstplan-sessie wilt beëindigen, log dan uit in de app. Let op: na het
          wissen van je browsergegevens moet je opnieuw inloggen en kunnen
          lokale voorkeuren terugvallen op de standaardwaarden.
        </p>
      </section>

      <section className="legal-section">
        <h2>5. Meer informatie</h2>
        <p>
          Hoe we met persoonsgegevens omgaan, staat in het{" "}
          <a href="/privacy">privacybeleid</a>. Vragen over deze verklaring? Mail
          naar <a href={`mailto:${LEGAL_INFO.email}`}>{LEGAL_INFO.email}</a>.
        </p>
      </section>

      <ContactBlock />
    </>
  );
}

export function LegalPage({ page }: { page: LegalPageKind }) {
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    document.title = `${PAGE_TITLES[page]} · ${LEGAL_INFO.productName}`;
  }, [page]);

  return (
    <div className="legal-shell">
      <Navbar
        className="navbar-legal"
        brand={
          <div className="legal-nav-brand">
            <a
              className="ge-back"
              href="/"
              title="Terug naar tuinen"
              aria-label="Terug naar tuinen"
            >
              <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            </a>
            <div className="gl-brand">
              <LogoMark className="gl-mark" />
              <h1>oogstplan</h1>
            </div>
          </div>
        }
        actions={<ThemeToggle theme={theme} onToggle={toggleTheme} />}
      />

      <main className="legal-main">
        <p className="legal-eyebrow">{PAGE_EYEBROWS[page]}</p>
        <h1 className="legal-title">{PAGE_TITLES[page]}</h1>
        <p className="legal-updated">Laatst bijgewerkt: {LEGAL_UPDATED}</p>

        {page === "privacy" && <PrivacyContent />}
        {page === "voorwaarden" && <TermsContent />}
        {page === "cookies" && <CookiesContent />}

        <nav className="legal-page-nav" aria-label="Juridische pagina's">
          <a href="/privacy">Privacybeleid</a>
          <a href="/voorwaarden">Gebruiksvoorwaarden</a>
          <a href="/cookies">Cookieverklaring</a>
        </nav>
      </main>

      <LegalFooter />
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <span className="legal-footer-copy">
        <span>© {new Date().getFullYear()} {LEGAL_INFO.productName}</span>
      </span>
      <nav aria-label="Juridisch">
        <a href="/privacy">Privacy</a>
        <a href="/voorwaarden">Voorwaarden</a>
        <a href="/cookies">Cookies</a>
        <a href={`mailto:${LEGAL_INFO.email}`}>Contact</a>
      </nav>
    </footer>
  );
}
