import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analysePhoto, reconstructLocally } from '../services/reconstruction';
import { saveModel } from '../services/storage';
import type { CaptureQuality, ReconstructionProgress } from '../types';
import { Brand } from './AppFrame';
import { Icon } from './Icon';

const MIN_PHOTOS = 8;
const MAX_PHOTOS = 16;

const PhotoThumb: React.FC<{ photo: Blob; index: number; onRemove: () => void }> = ({ photo, index, onRemove }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);
  return (
    <button className="capture-thumb" onClick={onRemove} aria-label={`Rimuovi foto ${index + 1}`}>
      {url && <img src={url} alt=""/>}
      <span>{String(index + 1).padStart(2, '0')}</span>
    </button>
  );
};

const DigitalCloneCapture: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [locationName, setLocationName] = useState('Nuova location');
  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [quality, setQuality] = useState<CaptureQuality | null>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState<ReconstructionProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices?.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then((stream) => {
      if (!mounted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraState('ready');
    }).catch(() => setCameraState('unavailable'));

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy || photos.length >= MAX_PHOTOS) return;
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
      if (result.accepted) setPhotos((current) => [...current, blob]);
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
      const available = MAX_PHOTOS - photos.length;
      const selection = Array.from(files).slice(0, available);
      const accepted: Blob[] = [];
      for (const file of selection) {
        if (!file.type.startsWith('image/')) continue;
        const result = await analysePhoto(file);
        if (result.accepted) accepted.push(file);
      }
      setPhotos((current) => [...current, ...accepted]);
      setQuality({ brightness: 128, sharpness: 20, accepted: true, message: `${accepted.length} foto importate` });
      if (accepted.length < selection.length) setError(`${selection.length - accepted.length} foto escluse perché troppo scure o poco nitide.`);
    } catch {
      setError('Non sono riuscito a leggere alcune immagini.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createSpace = async () => {
    if (photos.length < MIN_PHOTOS || processing) return;
    setError('');
    try {
      setProcessing({ progress: 3, message: 'Preparo l’elaborazione locale' });
      const record = await reconstructLocally(locationName, photos, setProcessing);
      setProcessing({ progress: 96, message: 'Salvo il gemello sul dispositivo' });
      await saveModel(record);
      setProcessing({ progress: 100, message: 'Spazio pronto' });
      navigate(`/viewer/${record.id}?edit=true`);
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : 'Elaborazione non riuscita.');
      setProcessing(null);
    }
  };

  const coverage = Math.min(100, Math.round((photos.length / MAX_PHOTOS) * 100));

  return (
    <main className="capture-screen">
      <video ref={videoRef} autoPlay muted playsInline className="capture-video"/>
      <div className="capture-shade"/>
      <header className="capture-header">
        <button className="glass-button" onClick={() => navigate(-1)} aria-label="Chiudi acquisizione"><Icon name="close"/></button>
        <Brand compact/>
        <span className="capture-header__counter">{String(photos.length).padStart(2, '0')}<small>/{MAX_PHOTOS}</small></span>
      </header>

      <div className="capture-hud" aria-hidden="true">
        <span className="hud-corner hud-corner--tl"/><span className="hud-corner hud-corner--tr"/>
        <span className="hud-corner hud-corner--bl"/><span className="hud-corner hud-corner--br"/>
        <div className="level-line"><i/><span>0°</span></div>
        <div className="coverage-ring" style={{ '--coverage': `${coverage * 3.6}deg` } as React.CSSProperties}>
          <div><Icon name="cube" size={29}/><span>{coverage}%</span></div>
        </div>
      </div>

      {cameraState !== 'ready' && (
        <div className="camera-fallback">
          <Icon name={cameraState === 'loading' ? 'camera' : 'image'} size={35}/>
          <strong>{cameraState === 'loading' ? 'Avvio fotocamera…' : 'Fotocamera non disponibile'}</strong>
          <p>Puoi comunque scegliere foto già scattate dal dispositivo.</p>
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()}><Icon name="upload"/>Scegli foto</button>
        </div>
      )}

      <section className="capture-guidance" aria-live="polite">
        <span className={`quality-dot ${quality?.accepted ? 'quality-dot--ok' : quality ? 'quality-dot--warn' : ''}`}/>
        <div>
          <strong>{quality?.message || (photos.length ? 'Ruota lentamente verso destra' : 'Inquadra il centro della stanza')}</strong>
          <p>{photos.length < MIN_PHOTOS ? `Ancora ${MIN_PHOTOS - photos.length} foto per creare lo spazio` : 'Copertura minima raggiunta. Continua per più dettaglio.'}</p>
        </div>
      </section>

      <section className="capture-controls">
        <div className="capture-thumbs">
          {photos.map((photo, index) => <PhotoThumb key={`${photo.size}-${index}`} photo={photo} index={index} onRemove={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}/>)}
          {photos.length < MAX_PHOTOS && <button className="capture-thumb capture-thumb--add" onClick={() => fileInputRef.current?.click()} aria-label="Importa foto"><Icon name="plus"/></button>}
        </div>
        <div className="capture-actions">
          <button className="glass-button glass-button--label" onClick={() => fileInputRef.current?.click()}><Icon name="image"/><span>Importa</span></button>
          <button className="shutter" disabled={cameraState !== 'ready' || busy || photos.length >= MAX_PHOTOS} onClick={capturePhoto} aria-label="Scatta foto"><i/></button>
          <button className="glass-button glass-button--label" disabled={!photos.length} onClick={() => setPhotos((current) => current.slice(0, -1))}><Icon name="rotate"/><span>Annulla</span></button>
        </div>
        <div className="capture-finish">
          <label>Nome location<input value={locationName} onChange={(event) => setLocationName(event.target.value)} maxLength={48}/></label>
          <button className="primary-button" disabled={photos.length < MIN_PHOTOS || busy} onClick={createSpace}>
            <span>Crea spazio 3D</span><Icon name="spark"/>
          </button>
        </div>
        {error && <p className="capture-error"><Icon name="warning" size={16}/>{error}</p>}
      </section>

      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => importPhotos(event.target.files)}/>

      {processing && (
        <div className="processing-overlay">
          <div className="processing-visual"><span/><span/><span/><Icon name="cube" size={42}/></div>
          <span className="eyebrow">Motore locale · nessun upload</span>
          <h2>Costruzione dello spazio</h2>
          <p>{processing.message}</p>
          <div className="progress-track"><i style={{ width: `${processing.progress}%` }}/></div>
          <strong>{processing.progress}%</strong>
        </div>
      )}
    </main>
  );
};

export default DigitalCloneCapture;
