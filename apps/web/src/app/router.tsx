import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { StatusPage } from '@/pages/StatusPage';

/** Registre aqui as rotas de cada feature conforme elas forem criadas. */
const router = createBrowserRouter([
  {
    // Provisório: vira o catálogo de jogos quando a lista existir.
    path: '/',
    element: <StatusPage />,
  },
  {
    path: '/status',
    element: <StatusPage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
