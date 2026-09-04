import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DigitalCloneRecord } from '../types';
import { deleteModel, getAllModels, saveModel } from '../services/storage';
import { createDemoRecord } from '../services/reconstruction';
import { parsePortableProject, shareProject } from '../services/share';
import AppFrame from './AppFrame';
import { Icon } from './Icon';

const Library: React.FC = () => {
  const navigate = useNavigate();
  const importRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<DigitalCloneRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DigitalCloneRecord | null>(null);
  const [notice, setNotice] = useState('');

  const loadModels = async () => {
    setLoading(true);
    try {
      const stored = await getAllModels();
      setModels([createDemoRecord(), ...stored.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadModels(); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleModels = useMemo(
    () => models.filter((model) => model.name.toLowerCase().includes(search.toLowerCase().trim())),
    [models, search],
  );

  const handleShare = async (model: DigitalCloneRecord) => {
    try {
      const result = await shareProject(model);
      setNotice(result === 'shared' ? 'Progetto condiviso' : 'Pacchetto .locset scaricato');
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') setNotice('Condivisione non riuscita');
    }
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const record = await parsePortableProject(file);
      await saveModel(record);
      await loadModels();
      setNotice('Location importata nella libreria');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Importazione non riuscita');
    }
    if (importRef.current) importRef.current.value = '';
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteModel(deleteTarget.id);
    setDeleteTarget(null);
    await loadModels();
    setNotice('Location eliminata');
  };

  return (
    <AppFrame action={<button className="header-action" onClick={() => navigate('/capture')}><Icon name="plus"/><span>Nuova scansione</span></button>}>
      <main className="library-page page-width">
        <section className="library-heading">
          <div><span className="eyebrow">Archivio locale</span><h1>Le tue location</h1><p>Gemelli digitali, riferimenti e piani di scena disponibili anche offline.</p></div>
          <div className="library-heading__stats"><strong>{Math.max(0, models.length - 1)}</strong><span>location<br/>acquisite</span></div>
        </section>

        <section className="library-toolbar">
          <label className="search-field"><Icon name="search"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca una location…"/></label>
          <button className="secondary-button" onClick={() => importRef.current?.click()}><Icon name="upload"/>Importa .locset</button>
          <input ref={importRef} type="file" hidden accept=".locset,application/json" onChange={(event) => handleImport(event.target.files?.[0])}/>
        </section>

        {loading ? (
          <div className="library-loading"><span/><p>Apro la libreria locale…</p></div>
        ) : visibleModels.length ? (
          <section className="location-grid">
            {visibleModels.map((model) => (
              <article className="location-card" key={model.id}>
                <button className="location-card__preview" onClick={() => navigate(`/viewer/${model.id}`)} aria-label={`Apri ${model.name}`}>
                  {model.thumbnail ? <img src={model.thumbnail} alt=""/> : <div className="demo-preview"><i/><i/><i/><span>STUDIO 04</span></div>}
                  <span className="location-card__badge"><i/>PRONTA</span>
                  <span className="location-card__photo-count"><Icon name="image" size={15}/>{model.images.length || 'DEMO'}</span>
                </button>
                <div className="location-card__body">
                  <div className="location-card__title">
                    <div><h2>{model.name}</h2><p>{model.isDemo ? 'Spazio dimostrativo' : `${model.images.length} viste · Elaborazione locale`}</p></div>
                    {!model.isDemo && <button className="icon-button" onClick={() => setDeleteTarget(model)} aria-label="Elimina"><Icon name="trash" size={18}/></button>}
                  </div>
                  <div className="location-card__actions">
                    <button onClick={() => navigate(`/viewer/${model.id}`)}><Icon name="eye"/>Esplora</button>
                    <button onClick={() => navigate(`/viewer/${model.id}?edit=true`)}><Icon name="edit"/>Modifica</button>
                    <button onClick={() => handleShare(model)}><Icon name="share"/><span className="sr-only">Condividi</span></button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="library-empty"><span><Icon name="search" size={30}/></span><h2>Nessuna location trovata</h2><p>Prova un altro termine oppure avvia una nuova acquisizione.</p></section>
        )}
      </main>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleteTarget(null)}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="confirm-dialog__icon"><Icon name="trash"/></span>
            <h2 id="delete-title">Eliminare “{deleteTarget.name}”?</h2>
            <p>Foto, spazio 3D e modifiche verranno rimossi da questo dispositivo.</p>
            <div><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Annulla</button><button className="danger-button" onClick={confirmDelete}>Elimina</button></div>
          </div>
        </div>
      )}
      {notice && <div className="toast"><Icon name="check"/>{notice}</div>}
    </AppFrame>
  );
};

export default Library;
