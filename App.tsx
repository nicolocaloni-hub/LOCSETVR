
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/Home';
import DigitalCloneCapture from './components/DigitalCloneCapture';
import Library from './components/Library';
import Viewer from './components/Viewer';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Legacy redirects */}
        <Route path="/scan" element={<Navigate to="/capture" replace />} />
        <Route path="/photo-scan" element={<Navigate to="/capture" replace />} />
        <Route path="/tour-scan" element={<Navigate to="/capture" replace />} />
        
        <Route path="/capture" element={<DigitalCloneCapture />} />
        <Route path="/library" element={<Library />} />
        <Route path="/viewer/:id" element={<Viewer />} />
      </Routes>
    </Router>
  );
};

export default App;
