
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllModels, deleteModel, saveModel } from '../services/storage';
import { ModelRecord, DigitalCloneRecord } from '../types';
import { createWorldJob, pollJobStatus, downloadAsset } from '../services/worldLabs';

const Library: React.FC = () => {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAllModels();
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setModels(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerateWorld = async (e: React.MouseEvent, record: DigitalCloneRecord) => {
    e.stopPropagation();
    if (processingId) return;

    try {
      setProcessingId(record.id);
      
      const updatedRecord: DigitalCloneRecord = { ...record, status: 'uploading' };
      await saveModel(updatedRecord);
      loadData();

      const opId = await createWorldJob(updatedRecord);
      updatedRecord.operationId = opId;
      updatedRecord.status = 'processing';
      await saveModel(updatedRecord);
      loadData();

      // Polling
      let completed = false;
      let finalData = null;
      while (!completed) {
        await new Promise(r => setTimeout(r, 5000));
        const statusResponse = await pollJobStatus(opId);
        
        if (statusResponse.status === 'completed') {
          completed = true;
          finalData = statusResponse.result;
        } else if (statusResponse.status === 'failed') {
          throw new Error("Generation failed on World Labs.");
        }
      }

      if (finalData) {
        updatedRecord.status = 'ready';
        updatedRecord.worldId = finalData.world_id;
        
        // Scarichiamo gli asset necessari
        // Usiamo la versione 500k splats come default bilanciato
        const spzUrl = finalData.assets.splats.spz_urls['500k'] || finalData.assets.splats.spz_urls['full_res'];
        const colliderUrl = finalData.assets.mesh.collider_mesh_url;

        const [spzBlob, colliderBlob] = await Promise.all([
            downloadAsset(spzUrl),
            downloadAsset(colliderUrl)
        ]);

        updatedRecord.spzBlob = spzBlob;
        updatedRecord.colliderMeshBlob = colliderBlob;
        
        // Inizializziamo gli edits vuoti
        updatedRecord.edits = { objects: [], masks: [] };

        await saveModel(updatedRecord);
        loadData();
        alert("Digital Clone ready for Editing & VR!");
      }

    } catch (err: any) {
      console.error(err);
      const failedRecord: DigitalCloneRecord = { ...record, status: 'error', error: err.message };
      await saveModel(failedRecord);
      loadData();
      alert(`Error: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (record: DigitalCloneRecord) => {
    switch (record.status) {
      case 'draft': return <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] font-bold">DRAFT</span>;
      case 'uploading': return <span className="bg-blue-900 text-blue-300 px-2 py-1 rounded text-[10px] font-bold animate-pulse">UPLOADING...</span>;
      case 'processing': return <span className="bg-yellow-900 text-yellow-300 px-2 py-1 rounded text-[10px] font-bold animate-pulse">GENERATING...</span>;
      case 'ready': return <span className="bg-green-900 text-green-300 px-2 py-1 rounded text-[10px] font-bold">READY</span>;
      case 'error': return <span className="bg-red-900 text-red-300 px-2 py-1 rounded text-[10px] font-bold">ERROR</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="p-6 border-b border-slate-900 bg-slate-950 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition">
                <i className="fa-solid fa-chevron-left text-xl"></i>
            </button>
            <h1 className="text-2xl font-black italic tracking-tighter uppercase">Clone Library</h1>
        </div>
        <button onClick={() => navigate('/capture')} className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition shadow-lg shadow-cyan-900/40">
            <i className="fa-solid fa-plus mr-2"></i>NEW
        </button>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        {loading ? (
           <div className="flex justify-center items-center h-64">
               <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500"></div>
           </div>
        ) : models.length === 0 ? (
            <div className="text-center text-slate-700 mt-20">
                <i className="fa-solid fa-ghost text-6xl mb-6 opacity-20"></i>
                <p className="text-xl font-bold">No clones found.</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {models.map(model => {
                  const isClone = 'status' in model;
                  const record = model as DigitalCloneRecord;

                  return (
                    <div 
                        key={model.id} 
                        className={`bg-slate-900 rounded-3xl overflow-hidden shadow-xl border border-slate-800 transition-all ${record.status === 'ready' ? 'hover:border-cyan-500/50' : 'opacity-80'}`}
                    >
                        <div className="aspect-[4/3] relative bg-slate-800">
                            {model.thumbnail && <img src={model.thumbnail} className="w-full h-full object-cover" alt="" />}
                            <div className="absolute top-3 left-3">{isClone && getStatusBadge(record)}</div>
                        </div>

                        <div className="p-5 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-lg truncate uppercase tracking-tight">{model.name}</h3>
                                    <p className="text-[10px] text-slate-500 font-mono mt-1">{new Date(model.date).toLocaleString()}</p>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); if(window.confirm("Delete?")) deleteModel(model.id).then(loadData); }} className="text-slate-600 hover:text-red-500 p-2">
                                    <i className="fa-solid fa-trash-can"></i>
                                </button>
                            </div>

                            {isClone && record.status === 'ready' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => navigate(`/viewer/${model.id}`)}
                                        className="py-2 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2"
                                    >
                                        <i className="fa-solid fa-eye text-cyan-400"></i> VIEW
                                    </button>
                                    <button 
                                        onClick={() => navigate(`/viewer/${model.id}?edit=true`)}
                                        className="py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20"
                                    >
                                        <i className="fa-solid fa-pen-ruler"></i> EDIT
                                    </button>
                                </div>
                            )}

                            {isClone && record.status === 'draft' && (
                                <button 
                                    onClick={(e) => handleGenerateWorld(e, record)}
                                    disabled={!!processingId}
                                    className="w-full py-3 bg-white text-black rounded-xl font-black text-xs uppercase hover:bg-cyan-400 transition-colors"
                                >
                                    Generate World
                                </button>
                            )}
                        </div>
                    </div>
                  );
                })}
            </div>
        )}
      </main>
    </div>
  );
};

export default Library;
