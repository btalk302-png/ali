import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LiveProvider, ToastProvider } from './lib/context';
import { Pipeline } from './pages/Pipeline';
import { Workspace } from './pages/Workspace';
import { TitleResearch } from './pages/TitleResearch';
import { SettingsPage } from './pages/Settings';

export function App() {
  return (
    <LiveProvider>
      <ToastProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<Pipeline />} />
            <Route path="/projects/:id" element={<Workspace />} />
            <Route path="/research" element={<TitleResearch />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </LiveProvider>
  );
}
