import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Patients from './pages/Patients';
import Hospitals from './pages/Hospitals';
import Explainability from './pages/Explainability';
import Vitals from './pages/Vitals';
import Predict from './pages/Predict';
import './index.css';

const PAGES = {
  overview:       <Overview />,
  patients:       <Patients />,
  hospitals:      <Hospitals />,
  explainability: <Explainability />,
  vitals:         <Vitals />,
  predict:        <Predict />,
};

export default function App() {
  const [page, setPage] = useState('overview');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active={page} onNav={setPage} />
      <main style={{
        marginLeft: 220,
        flex: 1,
        padding: '32px 36px',
        maxWidth: 1200,
      }}>
        {PAGES[page]}
      </main>
    </div>
  );
}
