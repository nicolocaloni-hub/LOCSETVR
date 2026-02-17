
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [debugStatus, setDebugStatus] = useState<string>('');

  // --- DEBUG / TEST A LOGIC ---
  const testGenerateWorld = async () => {
    setDebugStatus('TEST STARTED: Sending request...');
    console.log('--- TEST A: Start ---');

    // Payload corretto per World Labs Marble API
    // Schema: { model, name, world_prompt: { image: { source: 'url', url: '...' } } }
    const payload = {
      name: "Test World Interlaken",
      model: "Marble 0.1-mini",
      world_prompt: {
        image: {
          source: "url",
          url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/360_panorama_of_Interlaken.jpg/1280px-360_panorama_of_Interlaken.jpg"
        }
      }
    };

    try {
      const res = await fetch('/api/worlds/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      console.log('Generate Response:', data);

      if (!res.ok) {
        setDebugStatus(`ERROR: ${res.status} - ${JSON.stringify(data)}`);
        return;
      }

      // L'API ritorna solitamente un oggetto Operation con un campo "name" (es. "operations/...")
      const operationName = data.name || data.operation_id;
      if (operationName) {
        setDebugStatus(`JOB CREATED: ${operationName}. Polling...`);
        pollOperation(operationName);
      } else {
        setDebugStatus('ERROR: No operation name in response.');
      }

    } catch (e: any) {
      console.error(e);
      setDebugStatus(`EXCEPTION: ${e.message}`);
    }
  };

  const pollOperation = (operationName: string) => {
    // Estrae ID se il formato è "operations/xyz"
    const id = operationName.split('/').pop() || operationName;

    const interval = setInterval(async () => {
        try {
            console.log(`Polling ID: ${id}...`);
            const res = await fetch(`/api/operations/${id}`);
            const data = await res.json();
            
            // Verifica campo done (o status)
            const isDone = data.done === true || data.status === 'completed';
            
            if (isDone) {
                clearInterval(interval);
                setDebugStatus('SUCCESS! Check Console for Assets.');
                console.log('--- TEST A SUCCESS ---');
                console.log('Assets:', data.response?.assets || data.result?.assets);
                console.log('Full Data:', data);
            } else {
                const progress = data.metadata?.progress || 'running';
                setDebugStatus(`POLLING: ${JSON.stringify(progress)}`);
                console.log('Status:', data);
            }

            if (data.error) {
                clearInterval(interval);
                setDebugStatus(`FAILED: ${JSON.stringify(data.error)}`);
                console.error('Operation Failed:', data.error);
            }

        } catch (e) {
            console.error("Polling error", e);
        }
    }, 3000); // Poll ogni 3 secondi
  };
  // --- END DEBUG LOGIC ---

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
      
      {/* DEBUG PANEL - TEST A */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2">
         <div className="bg-black/50 text-[10px] text-green-400 font-mono p-1 rounded max-w-[200px] break-all text-left">
            {debugStatus}
         </div>
         <button 
            onClick={testGenerateWorld}
            className="bg-red-900/50 hover:bg-red-800 text-red-200 text-[10px] px-3 py-1 rounded border border-red-500/30 uppercase font-bold"
         >
            <i className="fa-solid fa-bug mr-1"></i> TEST A: Generate World (URL)
         </button>
      </div>
      
      <footer className="absolute bottom-6 text-[10px] text-slate-700 font-mono pointer-events-none">
        v3.0-SPLATS • WEBXR READY
      </footer>
    </div>
  );
};

export default Home;
