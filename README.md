# LOCSETVR

PWA mobile-first per acquisire location con lo smartphone, costruire un ambiente fotografico 3D direttamente nel browser, pianificare il set con oggetti e volumi di esclusione ed entrare nella scena tramite WebXR.

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

La ricostruzione locale genera un ambiente fotografico spaziale navigabile. Non sostituisce una mesh fotogrammetrica metrica prodotta da una workstation con COLMAP/AliceVision; l'interfaccia espone questa distinzione senza simulare elaborazioni cloud.
