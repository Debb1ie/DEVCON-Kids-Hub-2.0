import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '../../src/components/Layout';
import Events from '../../src/pages/Events';
import '../../src/index.css';

createRoot(document.getElementById('root')).render(
  <MemoryRouter initialEntries={['/dashboard/events']}>
    <Routes>
      <Route path="/dashboard" element={<Layout />}>
        <Route path="events" element={<Events />} />
      </Route>
    </Routes>
  </MemoryRouter>
);
