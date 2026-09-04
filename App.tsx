import React, { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Home from './components/Home';

const DigitalCloneCapture = lazy(() => import('./components/DigitalCloneCapture'));
const Library = lazy(() => import('./components/Library'));
const Viewer = lazy(() => import('./components/Viewer'));

const App: React.FC = () => (
  <HashRouter>
    <Suspense fallback={<div className="route-loading"><span/><strong>LOCSETVR</strong></div>}>
      <Routes>
        <Route path="/" element={<Home/>}/>
        <Route path="/capture" element={<DigitalCloneCapture/>}/>
        <Route path="/library" element={<Library/>}/>
        <Route path="/viewer/:id" element={<Viewer/>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </Suspense>
  </HashRouter>
);

export default App;
