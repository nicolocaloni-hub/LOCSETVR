
import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div className="w-96 h-96 bg-cyan-500 rounded-full blur-[120px] absolute -top-20 -left-20 animate-pulse"></div>
          <div className="w-96 h-96 bg-indigo-600 rounded-full blur-[120px] absolute -bottom-20 -right-20 animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>
      
      <div className="z-10 max-w-md w-full">
        <div className="mb-6 inline-block p-5 bg-slate-900 rounded-3xl shadow-2xl border border-slate-800">
            <i className="fa-solid fa-wand-magic-sparkles text-6xl text-cyan-400"></i>
        </div>
        
        <h1 className="text-5xl font-black mb-2 tracking-tighter uppercase italic">LocSetVR</h1>
        <p className="text-cyan-400/80 mb-12 text-lg font-medium tracking-widest uppercase text-xs">Digital Clone Engine</p>

        <div className="flex flex-col gap-4">
          <button 
            onClick={() => navigate('/capture')}
            className="group w-full py-6 bg-cyan-600 hover:bg-cyan-500 rounded-2xl font-black text-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-cyan-900/40 flex items-center justify-center gap-4"
          >
             <i className="fa-solid fa-camera-retro group-hover:rotate-12 transition-transform"></i>
             NEW DIGITAL CLONE
          </button>
          
          <button 
            onClick={() => navigate('/library')}
            className="w-full py-5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-2xl font-bold text-lg transition flex items-center justify-center gap-3"
          >
            <i className="fa-solid fa-box-open text-slate-500"></i>
            LIBRARY
          </button>
        </div>

        <div className="mt-12 text-slate-500 text-[10px] uppercase tracking-[0.2em]">
            Powered by World Labs API & Gaussian Splatting
        </div>
      </div>
      
      <footer className="absolute bottom-6 text-[10px] text-slate-700 font-mono">
        v3.0-SPLATS • WEBXR READY
      </footer>
    </div>
  );
};

export default Home;
