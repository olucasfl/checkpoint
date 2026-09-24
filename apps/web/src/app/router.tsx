import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from '@/app/layout/AppLayout';
import { GamesPage } from '@/pages/GamesPage';
import { StatusPage } from '@/pages/StatusPage';

/**
 * Registre aqui as rotas de cada feature conforme elas forem criadas. Toda tela do app fica dentro
 * do `AppLayout` (fundo, navegação do topo e barra inferior).
 */
const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: <GamesPage />,
      },
      {
        path: '/status',
        element: <StatusPage />,
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
