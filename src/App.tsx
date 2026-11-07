import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LiveProvider, ToastProvider } from './lib/context';
import { Dashboard } from './pages/Dashboard';
import { Pipeline } from './pages/Pipeline';
import { Workspace } from './pages/Workspace';
import { Analytics } from './pages/Analytics';
import { Audience } from './pages/Audience';
import { Insights } from './pages/Insights';
import { CalendarPage } from './pages/Calendar';
import { Automation } from './pages/Automation';
import { SettingsPage } from './pages/Settings';

export function App() {
  return (
    <LiveProvider>
      <ToastProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Pipeline />} />
            <Route path="/projects/:id" element={<Workspace />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/audience" element={<Audience />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/automation" element={<Automation />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </LiveProvider>
  );
}
