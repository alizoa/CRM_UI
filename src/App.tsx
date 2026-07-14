import { Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

export function App() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
