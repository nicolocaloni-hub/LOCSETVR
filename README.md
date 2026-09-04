# LOCSETVR

PWA mobile-first per acquisire location con lo smartphone, costruire un ambiente fotografico 3D direttamente nel browser, pianificare il set con oggetti e volumi di esclusione ed entrare nella scena tramite WebXR.

L'acquisizione guidata distingue stanza, interno ampio ed esterno. Il percorso usa orientamento del telefono e bersagli progressivi per registrare separatamente pareti, pavimento/terreno e soffitto/cielo, evitando che le viste verticali vengano inserite nella fascia orizzontale.

Il riferimento davanti viene fissato dalla prima foto frontale accettata, usando la posizione della fotocamera al momento dello scatto. Il calcolo usa tutti e tre gli angoli del sensore, mantiene la verticale di gravità e supporta telefono verticale e orizzontale. Una miniatura 3D mostra progressivamente le foto acquisite. Se i sensori non sono disponibili, è possibile scegliere esplicitamente la guida manuale e importare una vista alla volta.

## Caratteristiche

- nessuna chiave API e nessun upload durante la ricostruzione;
- controllo reale di esposizione e nitidezza durante l'acquisizione;
- salvataggio offline in IndexedDB;
- editor 3D con camera, luci, talent, dolly, marker e volumi da escludere;
- esportazione/importazione di progetti `.locset`;
- modalità VR sui visori compatibili con WebXR.

## Avvio locale

```bash
npm install
npm run dev
```

Verifiche: `npm test` (Node 22.18+ o 24) controlla la matematica dell'orientamento; `npm run test:e2e` verifica il percorso mobile con fotocamera e sensori simulati, inclusi salvataggio e riapertura. I test browser usano Chrome installato; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` può indicare un eseguibile alternativo.

La ricostruzione locale genera un ambiente fotografico spaziale navigabile. Non sostituisce una mesh fotogrammetrica metrica prodotta da una workstation con COLMAP/AliceVision; l'interfaccia espone questa distinzione senza simulare elaborazioni cloud.
