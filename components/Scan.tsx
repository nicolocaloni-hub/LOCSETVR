import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { processVideoToModel } from '../services/photogrammetry';
import { saveModel } from '../services/storage';
import { ScanStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface FeaturePoint {
  id: number;
  x: number;
  y: number;
  scale: number;
}

const Scan: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const navigate = useNavigate();

  const [status, setStatus] = useState<ScanStatus>({ step: 'idle', progress: 0, message: '' });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  // Visual Guidance State
  const [points, setPoints] = useState<FeaturePoint[]>([]);
  const [guidanceText, setGuidanceText] = useState('Move slowly in a circle.');

  // Initialize Camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'environment', // Use back camera
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        setStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setStatus({ step: 'error', progress: 0, message: 'Camera access denied or unavailable.' });
      }
    };

    initCamera();

    return () => {
      // Cleanup stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer for recording & Guidance Logic
  useEffect(() => {
    let interval: any;
    if (status.step === 'recording') {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          const t = prev + 1;
          // Dynamic guidance based on time
          if (t > 5 && t < 10) setGuidanceText('Keep the object in the center box.');
          if (t >= 10 && t < 20) setGuidanceText('Move around to capture sides.');
          if (t >= 20 && t < 30) setGuidanceText('Capture high and low angles.');
          if (t >= 30) setGuidanceText('Finish up when ready.');
          return t;
        });
      }, 1000);
    } else {
      setRecordingTime(0);
      setGuidanceText('Move slowly in a circle.');
    }
    return () => clearInterval(interval);
  }, [status.step]);

  // Simulated Feature Point Tracking (Visual Effect)
  useEffect(() => {
    let pointInterval: any;
    if (status.step === 'recording') {
      pointInterval = setInterval(() => {
        // Generate random points near the center to simulate tracking
        const newPoints = Array.from({ length: 3 }).map(() => ({
          id: Math.random(),
          x: 50 + (Math.random() - 0.5) * 60, // 20% to 80% screen width
          y: 50 + (Math.random() - 0.5) * 60, // 20% to 80% screen height
          scale: 0.5 + Math.random() * 0.5
        }));
        
        setPoints(prev => [...prev.slice(-15), ...newPoints]); // Keep last 15 + new
      }, 300);
    } else {
      setPoints([]);
    }
    return () => clearInterval(pointInterval);
  }, [status.step]);

  const startRecording = () => {
    if (!stream) return;

    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' }); // Chrome/Android standard
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setStatus({ step: 'recording', progress: 0, message: 'Move slowly around the object...' });
  };

  const stopRecordingAndProcess = () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setStatus({ step: 'processing', progress: 0, message: 'Initializing processing...' });

      try {
        // Capture a thumbnail from the video feed before stopping
        const thumbnail = captureThumbnail();

        // Send to processing service
        const modelBlob = await processVideoToModel(blob, (msg, pct) => {
          setStatus({ step: 'processing', progress: pct, message: msg });
        });

        // Save to DB
        setStatus({ step: 'saving', progress: 100, message: 'Saving to library...' });
        const newRecord = {
          id: uuidv4(),
          name: `Scan ${new Date().toLocaleTimeString()}`,
          date: new Date().toISOString(),
          type: 'video' as const,
          thumbnail: thumbnail,
          modelBlob: modelBlob
        };

        await saveModel(newRecord);
        navigate('/library');

      } catch (error) {
        console.error(error);
        setStatus({ step: 'error', progress: 0, message: 'Processing failed. Try again.' });
      }
    };
  };

  const captureThumbnail = (): string => {
    if (!videoRef.current) return '';
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.5);
  };

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col">
      {/* Camera Feed */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* AR Visualization Layer */}
      {status.step === 'recording' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          
          {/* Scanning Beam */}
          <div className="absolute left-0 right-0 h-1 bg-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.8)] animate-[scan_3s_ease-in-out_infinite]" 
               style={{ top: '50%' }}></div>

          {/* Grid Overlay */}
          <div className="absolute inset-0 opacity-20" 
               style={{ 
                 backgroundImage: 'linear-gradient(rgba(0, 255, 255, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, 0.3) 1px, transparent 1px)',
                 backgroundSize: '100px 100px',
                 maskImage: 'radial-gradient(circle at center, black 40%, transparent 80%)'
               }}>
          </div>

          {/* Center Reticle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-cyan-500/30 rounded-lg flex items-center justify-center">
             <div className="w-60 h-60 border-2 border-dashed border-cyan-500/50 rounded-lg"></div>
             {/* Crosshair */}
             <div className="absolute w-4 h-4 bg-cyan-400/50 rounded-full"></div>
             
             {/* Corner Brackets */}
             <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400"></div>
             <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400"></div>
             <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400"></div>
             <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400"></div>
          </div>

          {/* Feature Points */}
          {points.map((p) => (
            <div 
              key={p.id}
              className="absolute w-2 h-2 bg-cyan-400 rounded-full shadow-lg transition-opacity duration-500"
              style={{ 
                left: `${p.x}%`, 
                top: `${p.y}%`, 
                transform: `scale(${p.scale})`,
                opacity: 0.8,
                animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite'
              }}
            ></div>
          ))}

          {/* Custom Animation Keyframes Injection */}
          <style>{`
            @keyframes scan {
              0%, 100% { top: 10%; opacity: 0; }
              10% { opacity: 1; }
              50% { top: 90%; }
              90% { opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* Overlay UI */}
      <div className="z-10 absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
        <div className="flex justify-between items-start">
          <button onClick={() => navigate('/')} className="pointer-events-auto bg-black/50 text-white p-3 rounded-full backdrop-blur-md border border-white/10">
            <i className="fa-solid fa-arrow-left"></i>
          </button>
          
          {status.step === 'recording' && (
             <div className="flex items-center gap-3">
               <div className="bg-red-500/80 px-4 py-1 rounded-full text-white font-mono font-bold animate-pulse flex items-center gap-2 border border-red-400/50">
                 <div className="w-2 h-2 bg-white rounded-full"></div>
                 {new Date(recordingTime * 1000).toISOString().substr(14, 5)}
               </div>
             </div>
          )}
        </div>

        {/* Dynamic Instructions */}
        {status.step === 'recording' && (
          <div className="absolute top-1/4 left-0 right-0 flex justify-center">
            <div className="bg-black/60 backdrop-blur-md text-cyan-50 px-6 py-2 rounded-full border border-cyan-500/30 shadow-lg transform transition-all duration-500">
              <i className="fa-solid fa-crosshairs mr-2 text-cyan-400"></i>
              {guidanceText}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 mb-8 pointer-events-auto">
          {status.step === 'processing' || status.step === 'saving' ? (
            <div className="w-full max-w-md bg-gray-900/90 backdrop-blur-xl rounded-xl p-6 border border-gray-700 shadow-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-blue-400 font-mono text-sm font-bold">{status.message}</span>
                <span className="text-white font-mono text-sm">{Math.round(status.progress)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full rounded-full transition-all duration-300 relative" 
                  style={{ width: `${status.progress}%` }}
                >
                  <div className="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite]"></div>
                </div>
              </div>
            </div>
          ) : status.step === 'idle' ? (
            <div className="flex flex-col items-center gap-2">
               <div className="text-white/80 bg-black/40 px-3 py-1 rounded-full text-xs backdrop-blur-sm mb-2">
                 Tap to start scan
               </div>
               <button 
                onClick={startRecording}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-red-600 hover:bg-red-700 transition shadow-[0_0_20px_rgba(220,38,38,0.5)] active:scale-95"
              >
                <i className="fa-solid fa-camera text-2xl text-white"></i>
              </button>
            </div>
          ) : status.step === 'recording' ? (
            <button 
              onClick={stopRecordingAndProcess}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-transparent hover:bg-white/10 transition shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            >
              <div className="w-8 h-8 bg-red-500 rounded-sm animate-[pulse_2s_infinite]"></div>
            </button>
          ) : null}
          
          {status.step === 'error' && (
            <div className="bg-red-900/90 backdrop-blur-md text-white p-6 rounded-xl border border-red-500/50 shadow-xl max-w-xs text-center">
              <i className="fa-solid fa-triangle-exclamation text-3xl mb-2 text-red-300"></i>
              <p className="font-semibold">{status.message}</p>
              <button onClick={() => setStatus({step:'idle', progress:0, message:''})} className="mt-4 bg-white text-red-900 px-4 py-2 rounded-lg font-bold hover:bg-gray-100 w-full">
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Inline styles for custom animations */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default Scan;