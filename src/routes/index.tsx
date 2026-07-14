import { createBrowserRouter, Navigate } from 'react-router-dom';
import { App } from '../App';
import { AuthGuard } from '../components/auth/AuthGuard';
import { AccountPage } from '../pages/AccountPage';
import { ContactDetailPage } from '../pages/ContactDetailPage';
import { ContactsPage } from '../pages/ContactsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { DealDetailPage } from '../pages/DealDetailPage';
import { AcceptInvitePage } from '../pages/AcceptInvitePage';
import { LoginPage } from '../pages/LoginPage';
import { LeadsPage } from '../pages/LeadsPage';
import { LeadDetailPage } from '../pages/LeadDetailPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OrderDetailPage } from '../pages/OrderDetailPage';
import { OrdersPage } from '../pages/OrdersPage';
import { PipelinesPage } from '../pages/PipelinesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TasksPage } from '../pages/TasksPage';
import { TeamPage } from '../pages/TeamPage';
import { WhatsAppPage } from '../pages/WhatsAppPage';
import { WorklistPage } from '../pages/WorklistPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'accept-invite',
        element: <AcceptInvitePage />,
      },
      {
        path: 'forgot-password',
        element: <ForgotPasswordPage />,
      },
      {
        path: 'reset-password',
        element: <ResetPasswordPage />,
      },
      {
        path: 'dashboard',
        element: (
          <AuthGuard>
            <DashboardPage />
          </AuthGuard>
        ),
      },
      {
        path: 'today',
        element: (
          <AuthGuard>
            <WorklistPage />
          </AuthGuard>
        ),
      },
      {
        path: 'leads',
        element: (
          <AuthGuard>
            <LeadsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'leads/:id',
        element: (
          <AuthGuard>
            <LeadDetailPage />
          </AuthGuard>
        ),
      },
      {
        path: 'contacts',
        element: (
          <AuthGuard>
            <ContactsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'contacts/:id',
        element: (
          <AuthGuard>
            <ContactDetailPage />
          </AuthGuard>
        ),
      },
      {
        path: 'orders',
        element: (
          <AuthGuard>
            <OrdersPage />
          </AuthGuard>
        ),
      },
      {
        path: 'orders/:id',
        element: (
          <AuthGuard>
            <OrderDetailPage />
          </AuthGuard>
        ),
      },
      {
        path: 'pipelines',
        element: (
          <AuthGuard>
            <PipelinesPage />
          </AuthGuard>
        ),
      },
      {
        path: 'deals',
        element: (
          <AuthGuard>
            <PipelinesPage />
          </AuthGuard>
        ),
      },
      {
        path: 'deals/:id',
        element: (
          <AuthGuard>
            <DealDetailPage />
          </AuthGuard>
        ),
      },
      {
        path: 'tasks',
        element: (
          <AuthGuard>
            <TasksPage />
          </AuthGuard>
        ),
      },
      {
        path: 'whatsapp',
        element: (
          <AuthGuard>
            <WhatsAppPage />
          </AuthGuard>
        ),
      },
      {
        path: 'team',
        element: (
          <AuthGuard>
            <TeamPage />
          </AuthGuard>
        ),
      },
      {
        path: 'settings',
        element: (
          <AuthGuard>
            <SettingsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'account',
        element: (
          <AuthGuard>
            <AccountPage />
          </AuthGuard>
        ),
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
