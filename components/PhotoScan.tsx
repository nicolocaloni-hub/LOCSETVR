import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveModel } from '../services/storage';
import { TourRecord, PanoramaNode, ScanStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';

const TourScan: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ScanStatus>({ step: 'idle', progress: 0, message: '' });

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus({ step: 'processing', progress: 20, message: 'Loading panorama...' });

    // Create thumbnail
    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 320;
        canvas.height = 160;
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

        const nodeId = uuidv4();
        const startNode: PanoramaNode = {
          id: nodeId,
          name: 'Main Entrance',
          imageBlob: file,
          yawOffset: 0,
          hotspots: []
        };

        const newTour: TourRecord = {
          id: uuidv4(),
          name: `New Tour ${new Date().toLocaleTimeString()}`,
          date: new Date().toISOString(),
          thumbnail: thumbnail,
          nodes: [startNode],
          startNodeId: nodeId
        };

        setStatus({ step: 'saving', progress: 80, message: 'Saving to library...' });
        // @ts-ignore - Mapping old storage service to new tour structure
        await saveModel(newTour as any);
        setStatus({ step: 'complete', progress: 100, message: 'Success!' });
        navigate('/library');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-screen w-full bg-slate-900 text-white flex flex-col p-6 items-center justify-center">
      <header className="absolute top-0 left-0 w-full p-6 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="bg-slate-800 p-3 rounded-full">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <h2 className="text-xl font-bold">New Tour</h2>
      </header>

      <div className="max-w-md w-full flex flex-col gap-6 text-center">
        <div className="p-8 border-2 border-dashed border-slate-700 rounded-3xl bg-slate-800/50">
          <i className="fa-solid fa-upload text-5xl text-blue-400 mb-4"></i>
          <h3 className="text-lg font-bold mb-2">Import Panorama</h3>
          <p className="text-gray-400 text-sm mb-6">Upload a 2:1 equirectangular image (JPG/PNG).</p>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-bold transition w-full"
          >
            Select Image
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileImport}
          />
        </div>

        <div className="relative p-8 border border-slate-700 rounded-3xl bg-slate-800/20 opacity-50 cursor-not-allowed overflow-hidden">
          <div className="absolute top-2 right-2 bg-yellow-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-tighter">
            Coming Soon
          </div>
          <i className="fa-solid fa-camera text-5xl text-gray-500 mb-4"></i>
          <h3 className="text-lg font-bold mb-2">Assisted Capture</h3>
          <p className="text-gray-500 text-sm">Take multiple shots to build a 360 panorama.</p>
        </div>
      </div>

      {status.step !== 'idle' && (
        <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center p-6 z-50 backdrop-blur-sm">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
          <p className="text-lg font-bold">{status.message}</p>
          <div className="w-64 h-2 bg-slate-800 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TourScan;