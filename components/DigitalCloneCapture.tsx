import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { directionLabel, getSpaceTemplate, shotLabel, SPACE_TEMPLATES } from '../services/capturePlan';
import { cameraPose, relativePose, targetGuidance, type OrientationSample } from '../services/orientation';
import { useCaptureOrientation } from '../hooks/useCaptureOrientation';
import { analysePhoto, reconstructLocally } from '../services/reconstruction';
import { saveModel } from '../services/storage';
import type { CapturedFrame, ReconstructionProgress, SpaceKind } from '../types';
import { Brand } from './AppFrame';
import { Icon, type IconName } from './Icon';
import CaptureWorldPreview from './CaptureWorldPreview';
import './GuidedCapture.css';

const MODE_ICONS: Record<SpaceKind, IconName> = { room: 'box', hall: 'grid', outdoor: 'image' };

const PhotoThumb = ({ frame, index, disabled, onRemove }: { frame: CapturedFrame; index: number; disabled: boolean; onRemove: () => void }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(frame.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [frame.blob]);
  return <button className={'capture-thumb capture-thumb--' + frame.shot.role} disabled={disabled} onClick={onRemove} aria-label={'Riprendi foto ' + (index + 1) + ': ' + shotLabel(frame.shot)}>
    {url && <img src={url} alt=""/>}<span>{index + 1}</span>
  </button>;
};

const DigitalCloneCapture: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const sessionRef = useRef(0);
  const [phase, setPhase] = useState<'setup' | 'capture'>('setup');
  const [spaceKind, setSpaceKind] = useState<SpaceKind>('room');
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [locationName, setLocationName] = useState('');
  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState<ReconstructionProgress | null>(null);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const sensor = useCaptureOrientation(phase === 'capture' && !manual);
  const { pose, fresh, calibrated, rawRef, calibrationRef } = sensor;
  const template = getSpaceTemplate(spaceKind);
  const capturedIds = useMemo(() => new Set(frames.map((frame) => frame.shot.id)), [frames]);
  const currentShot = template.plan.find((shot) => !capturedIds.has(shot.id)) || template.plan[template.plan.length - 1];
  const captureComplete = template.plan.every((shot) => capturedIds.has(shot.id));
  const isReference = !calibrated && !manual;
  const guidance = pose && calibrated ? targetGuidance(currentShot, pose) : null;
  const frontalLevel = !!pose && Math.abs(pose.pitch) <= 18 && Math.abs(pose.roll) <= 25;
  const rawPose = fresh && rawRef.current ? calibrationRef.current
    ? relativePose(rawRef.current.sample, calibrationRef.current) : cameraPose(rawRef.current.sample) : null;
  const aligned = manual || (fresh && !!rawPose && (isReference
    ? Math.abs(rawPose.pitch) <= 18 && Math.abs(rawPose.roll) <= 25
    : targetGuidance(currentShot, rawPose).angularDistance <= 12 && Math.abs(rawPose.roll) <= 30));
  const canShoot = cameraState === 'ready' && !busy && !captureComplete && aligned;

  useEffect(() => {
    window.scrollTo(0, 0);
    return () => { sessionRef.current += 1; };
  }, []);

  useEffect(() => {
    if (phase !== 'capture') return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    setCameraState('loading');
    const timeout = window.setTimeout(() => { if (!cancelled) setCameraState('unavailable'); }, 15000);
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) { window.clearTimeout(timeout); setCameraState('ready'); }
      } catch { if (!cancelled) { window.clearTimeout(timeout); setCameraState('unavailable'); } }
    };
    void start();
    return () => { cancelled = true; window.clearTimeout(timeout); stream?.getTracks().forEach((track) => track.stop()); };
  }, [phase, cameraAttempt]);

  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(''), 2200);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  const beginGuide = () => {
    sessionRef.current += 1;
    sensor.requestAndReset();
    setFrames([]); setError(''); setManual(false); setPreviewExpanded(false);
    setAnnouncement(''); setPhase('capture');
  };

  const removeFrame = (id: string) => {
    if (busyRef.current) return;
    // Retaking a photo does not change the original front reference.
    setFrames((current) => current.filter((frame) => frame.shot.id !== id));
    setError(''); setPreviewExpanded(false);
  };

  const processPhoto = async (blob: Blob, atShutter: OrientationSample | null, imported: boolean, session: number) => {
    const shot = currentShot;
    try {
      const measured = atShutter ? calibrationRef.current ? relativePose(atShutter, calibrationRef.current) : cameraPose(atShutter) : null;
      if (!imported && !manual) {
        const correct = measured && (calibrationRef.current
          ? targetGuidance(shot, measured).angularDistance <= 12 && Math.abs(measured.roll) <= 30
          : Math.abs(measured.pitch) <= 18 && Math.abs(measured.roll) <= 25);
        if (!correct) { setError('Allinea il telefono con la vista indicata prima di scattare.'); return; }
      }
      const quality = await analysePhoto(blob);
      if (session !== sessionRef.current) return;
      if (!quality.accepted) { setError(quality.message); return; }
      let acceptedPose = measured;
      if (!manual && !imported && !calibrationRef.current && atShutter) acceptedPose = sensor.calibrate(atShutter);
      if (imported && !calibrationRef.current) setManual(true);
      const source = manual || imported ? 'manual' as const : 'sensor' as const;
      setFrames((current) => [...current, { blob, shot, quality, pose: source === 'sensor' && acceptedPose
        ? { yaw: acceptedPose.yaw, pitch: acceptedPose.pitch, roll: acceptedPose.roll, source }
        : { yaw: shot.yaw, pitch: shot.pitch, roll: 0, source } }]);
      setAnnouncement(shotLabel(shot) + ' acquisito · anteprima aggiornata');
      if (navigator.vibrate) navigator.vibrate(35);
    } catch (cause) { if (session === sessionRef.current) setError(cause instanceof Error ? cause.message : 'Scatto non riuscito.'); }
    finally { busyRef.current = false; if (session === sessionRef.current) setBusy(false); }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !canShoot || busyRef.current) return;
    const reading = rawRef.current;
    const atShutter = reading && performance.now() - reading.time < 1800 ? { ...reading.sample } : null;
    // Sensor pose and camera pixels are sampled together, before JPEG encoding.
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) { setError('Impossibile leggere la fotocamera.'); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const session = sessionRef.current;
    busyRef.current = true; setBusy(true); setError('');
    canvas.toBlob((blob) => {
      if (session !== sessionRef.current) { busyRef.current = false; return; }
      if (!blob) { busyRef.current = false; setBusy(false); setError('Scatto non riuscito.'); return; }
      void processPhoto(blob, atShutter, false, session);
    }, 'image/jpeg', 0.86);
  };

  const importPhoto = (file?: File) => {
    if (!file || busyRef.current || captureComplete) return;
    busyRef.current = true; setBusy(true); setError('');
    void processPhoto(file, null, true, sessionRef.current);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const createSpace = async () => {
    if (!captureComplete || busyRef.current || processing) return;
    setError(''); busyRef.current = true;
    try {
      setProcessing({ progress: 3, message: 'Preparo le viste acquisite' });
      const record = await reconstructLocally(locationName, frames, spaceKind, setProcessing);
      await saveModel(record);
      navigate('/viewer/' + record.id + '?edit=true');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Elaborazione non riuscita.'); setProcessing(null); }
    finally { busyRef.current = false; }
  };

  if (phase === 'setup') return <main className="capture-setup">
    <header className="capture-setup__header"><button className="icon-button glass-button" onClick={() => navigate('/')} aria-label="Torna indietro"><Icon name="arrow-left"/></button><Brand compact/><span>NUOVA ACQUISIZIONE</span></header>
    <section className="capture-setup__content">
      <span className="eyebrow">Una foto alla volta</span><h1>Parti da quello<br/>che hai davanti.</h1>
      <p>La prima foto fissa il davanti. Poi segui la guida: destra, dietro, sinistra, pavimento e soffitto. L’anteprima si compone a ogni scatto.</p>
      <div className="space-options" role="radiogroup" aria-label="Tipo di spazio">
        {(Object.keys(SPACE_TEMPLATES) as SpaceKind[]).map((kind) => {
          const option = SPACE_TEMPLATES[kind];
          return <button key={kind} className={kind === spaceKind ? 'selected' : ''} role="radio" aria-checked={kind === spaceKind} onClick={() => setSpaceKind(kind)}>
            <span className="space-options__icon"><Icon name={MODE_ICONS[kind]} size={28}/><i/><i/></span>
            <span className="space-options__copy"><small>{option.subtitle}</small><strong>{option.title}</strong><em>{option.description}</em></span>
            <span className="space-options__count"><b>{option.photoCount}</b><small>foto</small></span><span className="space-options__check"><Icon name="check" size={16}/></span>
          </button>;
        })}
      </div>
      <div className="capture-rules">
        <span><b>01</b><strong>Prima foto: davanti</strong><small>Telefono all’altezza degli occhi. Scatta la vista frontale.</small></span>
        <span><b>02</b><strong>Gira sul posto</strong><small>Segui la freccia: a 180° stai riprendendo il dietro.</small></span>
        <span><b>03</b><strong>Guarda lo spazio crescere</strong><small>Ogni scatto riempie un’area dell’anteprima 3D.</small></span>
      </div>
      <button className="primary-button capture-setup__start" onClick={beginGuide}><span>Inizia dalla foto frontale · {template.photoCount} foto</span><Icon name="camera"/></button>
    </section>
  </main>;

  let guidanceTitle = 'Inquadra davanti a te';
  let guidanceDetail = 'Tieni il telefono all’altezza degli occhi e scatta la prima foto.';
  let arrow = '';
  if (captureComplete) { guidanceTitle = 'Tutte le viste sono pronte'; guidanceDetail = 'Dai un nome alla location e apri lo spazio.'; }
  else if (manual) { guidanceTitle = shotLabel(currentShot); guidanceDetail = currentShot.instruction; }
  else if (!fresh) { guidanceTitle = sensor.permission === 'denied' ? 'Sensore di movimento non disponibile' : 'In attesa del movimento del telefono'; guidanceDetail = 'Puoi seguire le direzioni anche con la guida manuale.'; }
  else if (isReference && !frontalLevel) { guidanceTitle = 'Guarda davanti, all’altezza degli occhi'; guidanceDetail = Math.abs(pose?.roll ?? 0) > 25 ? 'Raddrizza il telefono, senza inclinarlo di lato.' : (pose?.pitch ?? 0) < -18 ? 'Alza il telefono verso la parete davanti a te.' : 'Abbassa il telefono verso la parete davanti a te.'; arrow = (pose?.pitch ?? 0) < 0 ? '↑' : '↓'; }
  else if (aligned) { guidanceTitle = isReference ? 'Scatta: questo sarà il davanti' : 'Ci sei. Scatta questa vista'; guidanceDetail = isReference ? 'La prima foto diventerà il riferimento per tutta la scansione.' : shotLabel(currentShot) + ' · tieni ferma la fotocamera'; }
  else if (guidance) {
    if (Math.abs(pose?.roll ?? 0) > 30) { guidanceTitle = 'Raddrizza il telefono'; guidanceDetail = 'Puoi usarlo verticale o orizzontale, mantenendo l’immagine dritta.'; }
    else if (Math.abs(guidance.yawDelta) > 18) { arrow = guidance.yawDelta >= 0 ? '→' : '←'; guidanceTitle = 'Gira a ' + (guidance.yawDelta >= 0 ? 'destra' : 'sinistra'); guidanceDetail = Math.round(Math.abs(guidance.yawDelta)) + '° alla prossima vista · ' + shotLabel(currentShot); }
    else { arrow = guidance.pitchDelta > 0 ? '↑' : '↓'; guidanceTitle = guidance.pitchDelta > 0 ? 'Alza il telefono' : 'Abbassa il telefono'; guidanceDetail = shotLabel(currentShot) + ' · porta il punto dentro al mirino'; }
  }
  const targetX = isReference || !guidance ? 50 : 50 + guidance.x * 40;
  const targetY = isReference || !guidance ? 50 : 50 + guidance.y * 19;
  const lowerRole = spaceKind === 'outdoor' ? 'ground' : 'floor';
  const upperRole = spaceKind === 'outdoor' ? 'sky' : 'ceiling';

  return <main className="capture-screen guided-capture">
    <video ref={videoRef} autoPlay muted playsInline className="capture-video"/>
    <div className="capture-shade"/>
    <header className="capture-header">
      <button className="icon-button glass-button" disabled={busy || !!processing} onClick={() => {
        if (frames.length && !window.confirm('Vuoi ricominciare? Le foto di questa acquisizione non ancora salvata saranno scartate.')) return;
        sessionRef.current += 1; sensor.reset(); setPhase('setup');
      }} aria-label="Cambia tipo di spazio"><Icon name="arrow-left"/></button>
      <Brand compact/><span className="capture-header__counter">{String(frames.length).padStart(2, '0')}<small>/{template.photoCount}</small></span>
    </header>
    <div className="guided-top">
      <div className="guided-direction"><span className="eyebrow">{frames.length ? 'Prossima vista' : 'Il tuo riferimento'}</span><strong>{captureComplete ? 'Completo' : shotLabel(currentShot)}</strong>
        <span className="guided-sensor">{manual ? 'Guida manuale' : calibrated ? 'Davanti fissato dalla prima foto' : 'Prima foto frontale'}</span>
        <div className="guided-compass" aria-label={'Direzione obiettivo: ' + directionLabel(currentShot.yaw)}><span>D</span><i style={{ transform: 'rotate(' + currentShot.yaw + 'deg)' }}>↑</i><span>{currentShot.yaw}°</span></div>
      </div>
      <div className={'guided-preview' + (previewExpanded ? ' guided-preview--expanded' : '')}>
        <CaptureWorldPreview frames={frames} spaceKind={spaceKind} currentShot={captureComplete ? undefined : currentShot} expanded={previewExpanded}/>
        <button className="guided-preview-toggle" onClick={() => setPreviewExpanded((value) => !value)} aria-label={previewExpanded ? 'Riduci anteprima 3D' : 'Ingrandisci anteprima 3D'}><Icon name={previewExpanded ? 'minus' : 'plus'} size={14}/>{previewExpanded ? 'Riduci' : 'Anteprima 3D'}</button>
      </div>
    </div>
    <div className="capture-hud" aria-hidden="true">
      <div className={'capture-crosshair' + (aligned && !manual ? ' capture-crosshair--ready' : '')}><i/><i/></div>
      {!captureComplete && fresh && !manual && <div className={'capture-target' + (aligned ? ' capture-target--aligned' : '')} style={{ left: targetX + '%', top: targetY + '%' }}><span/></div>}
      {captureComplete && <div className="capture-complete-mark"><Icon name="check" size={32}/></div>}
    </div>
    {cameraState !== 'ready' && !captureComplete && <div className="camera-fallback">
      <Icon name="camera" size={26}/><strong>{cameraState === 'loading' ? 'Avvio fotocamera…' : 'Fotocamera non disponibile'}</strong>
      <p>{cameraState === 'loading' ? 'Consenti l’accesso alla fotocamera del telefono.' : 'Puoi importare una foto per questa vista: ' + shotLabel(currentShot) + '.'}</p>
      {cameraState === 'unavailable' && <button className="secondary-button" onClick={() => setCameraAttempt((n) => n + 1)}>Riprova fotocamera</button>}
    </div>}
    <section className="guided-bottom">
      <div className="guided-instruction" role="status"><span className={aligned ? 'guided-arrow ready' : 'guided-arrow'}>{captureComplete ? '✓' : arrow || (aligned ? '●' : '◎')}</span><div><strong>{guidanceTitle}</strong><p>{guidanceDetail}</p></div></div>
      {!manual && !fresh && !captureComplete && <button className="guided-manual" onClick={() => { setManual(true); setError(''); }}>Continua con guida manuale <Icon name="chevron-right" size={14}/></button>}
      {announcement && <p className="guided-accepted" role="status"><Icon name="check" size={14}/>{announcement}</p>}
      <ol className="guided-stages" aria-label="Avanzamento acquisizione">
        {(['wall', lowerRole, upperRole] as const).map((role, index) => {
          const total = template.plan.filter((shot) => shot.role === role).length;
          const count = frames.filter((frame) => frame.shot.role === role).length;
          return <li key={role} className={currentShot.role === role ? 'active' : count === total ? 'done' : ''}><span>{index + 1}. {role === 'wall' ? 'Intorno' : index === 1 ? 'Sotto' : 'Sopra'}</span><b>{count}/{total}</b><i style={{ width: count / total * 100 + '%' }}/></li>;
        })}
      </ol>
      <div className="capture-thumbs">{frames.map((frame, index) => <PhotoThumb key={frame.shot.id} frame={frame} index={index} disabled={busy || !!processing} onRemove={() => removeFrame(frame.shot.id)}/>)}</div>
      {captureComplete ? <div className="capture-finish capture-finish--complete"><label>Nome location<input placeholder="Es. Salotto — via Roma" value={locationName} onChange={(event) => setLocationName(event.target.value)} maxLength={48}/></label><button className="primary-button" onClick={createSpace}><span>Apri lo spazio</span><Icon name="cube"/></button></div>
        : <div className="capture-actions"><button className="glass-button glass-button--label" disabled={busy} onClick={() => fileInputRef.current?.click()}><Icon name="image"/><span>Importa vista</span></button><button className={'shutter' + (canShoot ? ' shutter--ready' : '')} disabled={!canShoot} onClick={capturePhoto} aria-label={isReference ? 'Scatta foto frontale' : 'Scatta foto'}><i/></button><button className="glass-button glass-button--label" disabled={!frames.length || busy} onClick={() => removeFrame(frames[frames.length - 1].shot.id)}><Icon name="rotate"/><span>Riprendi</span></button></div>}
      {error && <p className="capture-error" role="alert"><Icon name="warning" size={16}/>{error}</p>}
    </section>
    <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => importPhoto(event.target.files?.[0])}/>
    {processing && <div className="processing-overlay"><div className="processing-visual"><span/><span/><span/><Icon name="cube" size={42}/></div><span className="eyebrow">Acquisizione completa</span><h2>Preparo la tua location</h2><p>{processing.message}</p><div className="progress-track"><i style={{ width: processing.progress + '%' }}/></div><strong>{processing.progress}%</strong></div>}
  </main>;
};

export default DigitalCloneCapture;
