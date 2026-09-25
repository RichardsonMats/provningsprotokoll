# Provningsprotokoll

Obs, denna kod har utvecklats med stöd av generativ AI.

## Installation

Installera Node.js 18 eller senare. Projektet använder endast Node.js inbyggda
funktioner och har inga externa npm-paket.

Klona repot, byt till projektmappen och installera projektets npm-konfiguration:

```powershell
npm install
```

Internetanslutning krävs när programmet körs eftersom produktdata hämtas från
Systembolaget. Produktbilder och webbfonter hämtas också från Systembolagets
webbplats.

Skapa ett utskriftsklart protokoll genom att ange Systembolagets artikelnummer.
Artikelnumret finns på produktsidan och på hyllornas prislappar; både korta och fullständiga
nummer accepteras.

```powershell
npm run generate -- 1612 3341215 3498803
```

En återanvändbar .txt-fil `articles.txt` med ett artikelnummer per rad kan också användas som input:

```powershell
npm run generate -- --input articles.txt
```

Tomma rader ignoreras. Text efter `#` behandlas som kommentarer, så artikelnamn kan anges för läsbarhet: `180115 # Finn hazy IPA`.

Kommandot skapar `provningsprotokoll.html`. Öppna filen i en webbläsare och skriv ut
den. Layouten är gjord for A4 i liggande format, med en rad per produkt och plats for
handskrivna anteckningar.

Vid utskrift till PDF ska webbläsaren använda liggande A4 och skalning `100%`.
Bakgrundsfärger skrivs ut automatiskt av dokumentet.

Alla layoutval finns i `protocol.config.json`: kolumnordning och -bredd, teckensnitt,
textstorlek, kursiv stil, radhöjd, sidformat, marginaler samt färger för ytterram,
radavdelare och kolumnavdelare. `image.verticalPadding` styr luft ovanför och under
produktbilden. Om kolumnbredderna inte summerar till 100% skalas
de proportionellt av webbläsaren. Använd en annan konfigurationsfil med `--config`.

Varje kolumn har en `label` som styr rubriken i utskriften. Fargvärdena har VS Code
färgswatchar; klicka på swatchen bredvid ett hexvärde for att öppna färgväljaren.
Sätt en kolumns `bold` och/eller `italic` till `true` for att formatera både dess
rubrik och produkttext.

Valfri egen utdatafil:

```powershell
npm run generate -- --config min-layout.json --output olprovning.html 1612 3341215
```