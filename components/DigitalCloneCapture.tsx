import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSpaceTemplate, shortestAngle, SPACE_TEMPLATES } from '../services/capturePlan';
import { analysePhoto, reconstructLocally } from '../services/reconstruction';
import { saveModel } from '../services/storage';
import type { CapturedFrame, CaptureQuality, ReconstructionProgress, SpaceKind, SurfaceRole } from '../types';
import { Brand } from './AppFrame';
import { Icon, type IconName } from './Icon';

type OrientationReading = { yaw: number; pitch: number; available: boolean };
type CapturePhase = 'setup' | 'capture';

const ROLE_SHORT: Record<SurfaceRole, string> = {
  wall: 'P',
  floor: 'T',
  ceiling: 'S',
  ground: 'T',
  sky: 'C',
};

const MODE_ICONS: Record<SpaceKind, IconName> = {
  room: 'box',
  hall: 'grid',
  outdoor: 'image',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const PhotoThumb: React.FC<{ frame: CapturedFrame; index: number; onRemove: () => void }> = ({ frame, index, onRemove }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(frame.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [frame.blob]);
  return (
    <button className={`capture-thumb capture-thumb--${frame.shot.role}`} onClick={onRemove} aria-label={`Rimuovi foto ${index + 1}, ${frame.shot.label}`}>
      {url ? <img src={url} alt=""/> : null}
      <span>{ROLE_SHORT[frame.shot.role]}{String(index + 1).padStart(2, '0')}</span>
    </button>
  );
};

const DigitalCloneCapture: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orientationOriginRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<CapturePhase>('setup');
  const [spaceKind, setSpaceKind] = useState<SpaceKind>('room');
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [locationName, setLocationName] = useState('Nuova location');
  const [cameraState, setCameraState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [quality, setQuality] = useState<CaptureQuality | null>(null);
  const [orientationEnabled, setOrientationEnabled] = useState(false);
  const [orientation, setOrientation] = useState<OrientationReading>({ yaw: 0, pitch: 0, available: false });
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState<ReconstructionProgress | null>(null);
  const [error, setError] = useState('');

  const template = getSpaceTemplate(spaceKind);
  const capturedIds = useMemo(() => new Set(frames.map((frame) => frame.shot.id)), [frames]);
  const currentShot = template.plan.find((shot) => !capturedIds.has(shot.id)) || template.plan[template.plan.length - 1];
  const deltaYaw = orientation.available ? shortestAngle(currentShot.yaw, orientation.yaw) : 0;
  const deltaPitch = orientation.available ? currentShot.pitch - orientation.pitch : 0;
  const aligned = !orientation.available || (Math.abs(deltaYaw) < 16 && Math.abs(deltaPitch) < 14);
  const targetX = clamp(50 + deltaYaw * 0.72, 8, 92);
  const targetY = clamp(50 - deltaPitch * 0.72, 12, 88);
  const captureComplete = frames.length === template.photoCount;

  useEffect(() => {
    if (!orientationEnabled || phase !== 'capture') return;
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null || event.beta === null) return;
      if (orientationOriginRef.current === null) orientationOriginRef.current = event.alpha;
      const relativeYaw = ((orientationOriginRef.current - event.alpha) % 360 + 360) % 360;
      const pitch = clamp(90 - event.beta, -88, 88);
      setOrientation({ yaw: relativeYaw, pitch, available: true });
    };
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, [orientationEnabled, phase]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const requestOrientation = async () => {
    try {
      const orientationConstructor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (orientationConstructor?.requestPermission) {
        const permission = await orientationConstructor.requestPermission();
        setOrientationEnabled(permission === 'granted');
      } else if ('DeviceOrientationEvent' in window) {
        setOrientationEnabled(true);
      }
    } catch {
      setOrientationEnabled(false);
    }
  };

  const startCamera = async () => {
    setCameraState('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraState('ready');
    } catch {
      setCameraState('unavailable');
    }
  };

  const beginGuide = async () => {
    setFrames([]);
    setError('');
    setQuality(null);
    orientationOriginRef.current = null;
    setPhase('capture');
    await Promise.all([requestOrientation(), startCamera()]);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy || captureComplete) return;
    if (!aligned) {
      setQuality({ brightness: 128, sharpness: 0, accepted: false, message: 'Porta il bersaglio verde dentro al mirino' });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const scale = Math.min(1, 1600 / video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d', { alpha: false })?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Scatto non riuscito.')), 'image/jpeg', 0.86);
      });
      const result = await analysePhoto(blob);
      setQuality(result);
      if (result.accepted) setFrames((current) => [...current, { blob, shot: currentShot, quality: result }]);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Scatto non riuscito.');
    } finally {
      setBusy(false);
    }
  };

  const importPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      const openShots = template.plan.filter((shot) => !capturedIds.has(shot.id));
      const selection = Array.from(files).slice(0, openShots.length);
      const acceptedFrames: CapturedFrame[] = [];
      for (let index = 0; index < selection.length; index += 1) {
        const file = selection[index];
        if (!file.type.startsWith('image/')) continue;
        const result = await analysePhoto(file);
        if (result.accepted) acceptedFrames.push({ blob: file, shot: openShots[index], quality: result });
      }
      setFrames((current) => [...current, ...acceptedFrames]);
      setQuality({ brightness: 128, sharpness: 20, accepted: true, message: `${acceptedFrames.length} viste assegnate al piano` });
      if (acceptedFrames.length < selection.length) setError(`${selection.length - acceptedFrames.length} foto escluse perché troppo scure o poco nitide.`);
    } catch {
      setError('Non sono riuscito a leggere alcune immagini.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createSpace = async () => {
    if (!captureComplete || processing) return;
    setError('');
    try {
      setProcessing({ progress: 3, message: 'Preparo le superfici dello spazio' });
      const record = await reconstructLocally(locationName, frames, spaceKind, setProcessing);
      setProcessing({ progress: 96, message: 'Salvo il gemello sul dispositivo' });
      await saveModel(record);
      setProcessing({ progress: 100, message: 'Spazio pronto' });
      navigate(`/viewer/${record.id}?edit=true`);
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : 'Elaborazione non riuscita.');
      setProcessing(null);
    }
  };

  if (phase === 'setup') {
    return (
      <main className="capture-setup">
        <header className="capture-setup__header">
          <button className="glass-button" onClick={() => navigate(-1)} aria-label="Torna indietro"><Icon name="arrow-left"/></button>
          <Brand compact/>
          <span>NUOVA ACQUISIZIONE</span>
        </header>
        <section className="capture-setup__content">
          <span className="eyebrow">Prima di iniziare</span>
          <h1>Che tipo di spazio<br/>stai rilevando?</h1>
          <p>La scelta prepara una sequenza diversa per pareti, pavimento e copertura superiore.</p>

          <div className="space-options" role="radiogroup" aria-label="Tipo di spazio">
            {(Object.keys(SPACE_TEMPLATES) as SpaceKind[]).map((kind) => {
              const option = SPACE_TEMPLATES[kind];
              const selected = kind === spaceKind;
              return (
                <button key={kind} className={selected ? 'selected' : ''} role="radio" aria-checked={selected} onClick={() => setSpaceKind(kind)}>
                  <span className="space-options__icon"><Icon name={MODE_ICONS[kind]} size={28}/><i/><i/></span>
                  <span className="space-options__copy"><small>{option.subtitle}</small><strong>{option.title}</strong><em>{option.description}</em></span>
                  <span className="space-options__count"><b>{option.photoCount}</b><small>foto</small></span>
                  <span className="space-options__check"><Icon name="check" size={16}/></span>
                </button>
              );
            })}
          </div>

          <div className="capture-rules">
            <span><b>01</b><strong>Resta nello stesso punto</strong><small>Ruota il corpo, non camminare durante la sequenza.</small></span>
            <span><b>02</b><strong>Segui il bersaglio</strong><small>Porta il punto verde al centro prima di scattare.</small></span>
            <span><b>03</b><strong>Copri sopra e sotto</strong><small>Ogni foto sarà assegnata alla superficie corretta.</small></span>
          </div>

          <button className="primary-button capture-setup__start" onClick={beginGuide}>
            <span>Inizia la guida · {template.photoCount} foto</span><Icon name="camera"/>
          </button>
        </section>
      </main>
    );
  }

  const coverage = Math.round((frames.length / template.photoCount) * 100);
  const guidanceTitle = captureComplete
    ? 'Copertura completa'
    : aligned
      ? 'Posizione corretta — scatta ora'
      : 'Porta il bersaglio dentro al mirino';

  return (
    <main className={`capture-screen capture-screen--${currentShot.role}`}>
      <video ref={videoRef} autoPlay muted playsInline className="capture-video"/>
      <div className="capture-shade"/>
      <header className="capture-header">
        <button className="glass-button" onClick={() => {
          streamRef.current?.getTracks().forEach((track) => track.stop());
          setPhase('setup');
          setCameraState('idle');
        }} aria-label="Cambia tipo di spazio"><Icon name="arrow-left"/></button>
        <Brand compact/>
        <span className="capture-header__counter">{String(frames.length).padStart(2, '0')}<small>/{template.photoCount}</small></span>
      </header>

      <div className="capture-mode-chip"><Icon name={MODE_ICONS[spaceKind]} size={15}/>{template.title}<span>·</span>{currentShot.label}</div>

      <div className="capture-hud" aria-hidden="true">
        <span className="hud-corner hud-corner--tl"/><span className="hud-corner hud-corner--tr"/>
        <span className="hud-corner hud-corner--bl"/><span className="hud-corner hud-corner--br"/>
        <div className="capture-crosshair"><i/><i/></div>
        {!captureComplete ? (
          <div className={`capture-target ${aligned ? 'capture-target--aligned' : ''}`} style={{ left: `${targetX}%`, top: `${targetY}%` }}>
            <span/><b>{Math.abs(deltaPitch) > 20 ? (deltaPitch > 0 ? '↑' : '↓') : Math.abs(deltaYaw) > 20 ? (deltaYaw > 0 ? '→' : '←') : ''}</b>
          </div>
        ) : <div className="capture-complete-mark"><Icon name="check" size={32}/></div>}
      </div>

      <div className="coverage-map" aria-label={`Copertura ${coverage}%`}>
        <div className="coverage-map__labels"><span>SOPRA</span><span>ORIZZONTE</span><span>SOTTO</span></div>
        <div className="coverage-map__field">
          {template.plan.map((shot) => (
            <i
              key={shot.id}
              className={`${capturedIds.has(shot.id) ? 'done' : ''} ${shot.id === currentShot.id && !captureComplete ? 'current' : ''}`}
              style={{ left: `${2 + (shot.yaw / 360) * 96}%`, top: `${50 - (shot.pitch / 120) * 38}%` }}
            />
          ))}
        </div>
        <strong>{coverage}%</strong>
      </div>

      {cameraState !== 'ready' ? (
        <div className="camera-fallback">
          <Icon name={cameraState === 'loading' ? 'camera' : 'image'} size={35}/>
          <strong>{cameraState === 'loading' ? 'Avvio fotocamera…' : 'Fotocamera non disponibile'}</strong>
          <p>Importa le immagini nell’ordine indicato: pareti, parte bassa, parte alta.</p>
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()}><Icon name="upload"/>Scegli foto</button>
        </div>
      ) : null}

      <section className="capture-guidance" aria-live="polite">
        <span className={`quality-dot ${captureComplete || (quality?.accepted && aligned) ? 'quality-dot--ok' : quality && !quality.accepted ? 'quality-dot--warn' : ''}`}/>
        <div>
          <strong>{quality && !quality.accepted ? quality.message : guidanceTitle}</strong>
          <p>{captureComplete ? 'Ora puoi costruire lo spazio 3D.' : `${currentShot.instruction} · foto ${frames.length + 1} di ${template.photoCount}`}</p>
        </div>
      </section>

      <section className="capture-controls">
        <div className="capture-thumbs">
          {frames.map((frame, index) => <PhotoThumb key={frame.shot.id} frame={frame} index={index} onRemove={() => setFrames((current) => current.filter((item) => item.shot.id !== frame.shot.id))}/>)}
          {!captureComplete ? <button className="capture-thumb capture-thumb--add" onClick={() => fileInputRef.current?.click()} aria-label="Importa foto"><Icon name="plus"/></button> : null}
        </div>
        {!captureComplete ? (
          <div className="capture-actions">
            <button className="glass-button glass-button--label" onClick={() => fileInputRef.current?.click()}><Icon name="image"/><span>Importa</span></button>
            <button className={`shutter ${aligned ? 'shutter--ready' : ''}`} disabled={cameraState !== 'ready' || busy} onClick={capturePhoto} aria-label="Scatta foto"><i/></button>
            <button className="glass-button glass-button--label" disabled={!frames.length} onClick={() => setFrames((current) => current.slice(0, -1))}><Icon name="rotate"/><span>Riprendi</span></button>
          </div>
        ) : (
          <div className="capture-finish capture-finish--complete">
            <label>Nome location<input value={locationName} onChange={(event) => setLocationName(event.target.value)} maxLength={48}/></label>
            <button className="primary-button" onClick={createSpace}><span>Crea spazio 3D</span><Icon name="spark"/></button>
          </div>
        )}
        {error ? <p className="capture-error"><Icon name="warning" size={16}/>{error}</p> : null}
      </section>

      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => importPhotos(event.target.files)}/>

      {processing ? (
        <div className="processing-overlay">
          <div className="processing-visual"><span/><span/><span/><Icon name="cube" size={42}/></div>
          <span className="eyebrow">Pareti · sotto · sopra</span>
          <h2>Costruzione dello spazio</h2>
          <p>{processing.message}</p>
          <div className="progress-track"><i style={{ width: `${processing.progress}%` }}/></div>
          <strong>{processing.progress}%</strong>
        </div>
      ) : null}
    </main>
  );
};

export default DigitalCloneCapture;
