
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { saveModel } from '../services/storage';
import { DigitalCloneRecord } from '../types';

const MAX_PHOTOS = 16;

const DigitalCloneCapture: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (err) {
      setError("Camera access denied. Check permissions.");
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
  };

  const capturePhoto = () => {
    if (!videoRef.current || photos.length >= MAX_PHOTOS || isCapturing) return;

    setIsCapturing(true);
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Simula validazione (blur/exposure)
      const isOk = Math.random() > 0.05; // 95% success rate simulation

      if (isOk) {
        canvas.toBlob((blob) => {
          if (blob) {
            setPhotos(prev => [...prev, blob]);
          }
          setIsCapturing(false);
        }, 'image/jpeg', 0.95);
      } else {
        alert("Image too blurry! Please retake.");
        setIsCapturing(false);
      }
    }
  };

  const handleFinish = async () => {
    if (photos.length < MAX_PHOTOS) return;

    // Crea thumbnail dalla prima foto
    const thumbUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 300;
                canvas.height = 200;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, 300, 200);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(photos[0]);
    });

    const newClone: DigitalCloneRecord = {
      id: uuidv4(),
      name: `Clone ${new Date().toLocaleTimeString()}`,
      date: new Date().toISOString(),
      status: 'draft',
      images: photos,
      thumbnail: thumbUrl
    };

    await saveModel(newClone as any);
    navigate('/library');
  };

  return (
    <div className="h-screen w-full bg-black text-white flex flex-col overflow-hidden">
      {/* Header Info */}
      <div className="absolute top-0 left-0 w-full p-4 z-20 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => navigate('/')} className="p-3 bg-white/10 rounded-full backdrop-blur-md">
          <i className="fa-solid fa-xmark"></i>
        </button>
        <div className="text-center">
            <span className="text-xs font-black tracking-widest text-cyan-400 uppercase">Capture Mode</span>
            <div className="text-xl font-bold">{photos.length} / {MAX_PHOTOS}</div>
        </div>
        <div className="w-10 h-10"></div> {/* Spacer */}
      </div>

      {/* Camera Preview */}
      <div className="flex-1 relative bg-slate-900">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-full object-cover transition-opacity duration-300 ${isCapturing ? 'opacity-50' : 'opacity-100'}`}
        />
        
        {/* Overlay Grid */}
        <div className="absolute inset-0 pointer-events-none border-[20px] border-black/20">
            <div className="w-full h-full border border-white/20 grid grid-cols-2 grid-rows-2">
                <div className="border border-white/10"></div>
                <div className="border border-white/10"></div>
                <div className="border border-white/10"></div>
                <div className="border border-white/10"></div>
            </div>
        </div>

        {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
                <div>
                    <i className="fa-solid fa-circle-exclamation text-4xl text-red-500 mb-4"></i>
                    <p className="font-bold">{error}</p>
                </div>
            </div>
        )}
      </div>

      {/* Grid Status & Controls */}
      <div className="bg-slate-950 p-6 flex flex-col gap-6">
        <div className="grid grid-cols-8 gap-2">
            {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
                <div 
                    key={i} 
                    className={`aspect-square rounded-sm border ${i < photos.length ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-slate-800 border-slate-700'}`}
                />
            ))}
        </div>

        <div className="flex items-center justify-center gap-8">
            {photos.length > 0 && (
                <button 
                    onClick={() => setPhotos(prev => prev.slice(0, -1))}
                    className="p-4 text-slate-400 hover:text-white transition"
                >
                    <i className="fa-solid fa-rotate-left text-2xl"></i>
                </button>
            )}

            <button 
                disabled={photos.length >= MAX_PHOTOS || !!error}
                onClick={capturePhoto}
                className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
                    photos.length >= MAX_PHOTOS 
                    ? 'border-slate-800 bg-slate-900 opacity-50' 
                    : 'border-white bg-white/10 active:scale-90'
                }`}
            >
                <div className={`w-14 h-14 rounded-full ${photos.length >= MAX_PHOTOS ? 'bg-slate-700' : 'bg-white shadow-[0_0_20px_white]'}`}></div>
            </button>

            {photos.length === MAX_PHOTOS ? (
                <button 
                    onClick={handleFinish}
                    className="p-4 text-green-400 animate-bounce"
                >
                    <i className="fa-solid fa-circle-check text-3xl"></i>
                </button>
            ) : (
                <div className="p-4 w-12"></div>
            )}
        </div>

        <p className="text-center text-[10px] text-slate-500 font-bold tracking-tighter uppercase">
            {photos.length < MAX_PHOTOS 
              ? `Move slightly around the object for photo ${photos.length + 1}` 
              : "Capture complete! Ready to generate."}
        </p>
      </div>
    </div>
  );
};

export default DigitalCloneCapture;
