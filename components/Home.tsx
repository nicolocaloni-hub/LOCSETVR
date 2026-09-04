import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ModelRecord } from '../types';
import { getAllModels } from '../services/storage';
import AppFrame from './AppFrame';
import { Icon } from './Icon';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [models, setModels] = useState<ModelRecord[]>([]);

  useEffect(() => {
    getAllModels()
      .then((records) => setModels(records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))))
      .catch(() => setModels([]));
  }, []);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 13) return 'Buongiorno';
    if (hour < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  })();

  const recent = models[0];

  return (
    <AppFrame action={<button className="icon-button" aria-label="Profilo"><Icon name="user" size={18}/></button>}>
      <main className="dashboard page-width">
        <section className="dashboard__intro">
          <div>
            <span className="eyebrow">Workspace di produzione</span>
            <h1>{greeting},<br/><span>prepariamo il set.</span></h1>
          </div>
          <p>Scansiona una location, esplorala in scala ambiente e pianifica ogni inquadratura. Tutto resta sul tuo dispositivo.</p>
        </section>

        <section className="dashboard-grid">
          <article className="scan-card">
            <div className="scan-card__top">
              <span className="section-index">01</span>
              <span className="status-label"><i/>PRONTO ALLA SCANSIONE</span>
            </div>
            <div className="scan-card__body">
              <div className="scan-card__glyph" aria-hidden="true"><Icon name="scan" size={38}/><span/></div>
              <div>
                <h2>Crea un nuovo<br/>gemello digitale</h2>
                <p>8–16 foto sovrapposte · elaborazione sul dispositivo</p>
              </div>
            </div>
            <button className="primary-button primary-button--light" onClick={() => navigate('/capture')}>
              <span>Avvia acquisizione</span><Icon name="chevron-right"/>
            </button>
          </article>

          <button className="stage-card" onClick={() => navigate('/viewer/demo-studio')}>
            <div className="stage-card__scene" aria-hidden="true">
              <div className="stage-card__ceiling"/>
              <div className="stage-card__floor"/>
              <div className="stage-card__wall stage-card__wall--left"/>
              <div className="stage-card__wall stage-card__wall--right"/>
              <div className="stage-card__window"><i/><i/><i/></div>
              <div className="stage-card__platform"/>
              <div className="stage-card__light"><span/></div>
              <div className="stage-card__camera"/>
              <div className="stage-card__reticle"><i/><i/><i/><i/></div>
            </div>
            <div className="stage-card__overlay">
              <span className="demo-tag">SCENA DEMO</span>
              <div>
                <h2>Studio 04</h2>
                <p>Entra, muoviti e prova l’editor</p>
              </div>
              <span className="round-action"><Icon name="arrow-left" className="flip-x"/></span>
            </div>
          </button>
        </section>

        <section className="recent-section">
          <div className="section-heading">
            <div><span className="section-index">02</span><h2>Ultime location</h2></div>
            <button className="text-button" onClick={() => navigate('/library')}>Apri libreria <Icon name="chevron-right" size={16}/></button>
          </div>

          {recent ? (
            <button className="recent-project" onClick={() => navigate(`/viewer/${recent.id}`)}>
              <img src={recent.thumbnail} alt=""/>
              <span className="recent-project__meta">
                <strong>{recent.name}</strong>
                <small>{recent.images.length} viste · modificata {new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(new Date(recent.updatedAt))}</small>
              </span>
              <span className="recent-project__status"><i/>Pronta</span>
              <Icon name="chevron-right"/>
            </button>
          ) : (
            <div className="empty-strip">
              <span className="empty-strip__icon"><Icon name="folder"/></span>
              <div><strong>La tua libreria è vuota</strong><p>La prima acquisizione comparirà qui ed è disponibile anche offline.</p></div>
              <button className="secondary-button" onClick={() => navigate('/capture')}>Nuova scansione</button>
            </div>
          )}
        </section>

        <section className="workflow-strip" aria-label="Come funziona">
          <span><b>01</b><Icon name="camera"/>Acquisisci</span>
          <i/>
          <span><b>02</b><Icon name="spark"/>Ricostruisci</span>
          <i/>
          <span><b>03</b><Icon name="cube"/>Pianifica</span>
          <i/>
          <span><b>04</b><Icon name="headset"/>Entra in VR</span>
        </section>
      </main>
    </AppFrame>
  );
};

export default Home;
