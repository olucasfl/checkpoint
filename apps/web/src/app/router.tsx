import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { GamesPage } from '@/pages/GamesPage';
import { StatusPage } from '@/pages/StatusPage';

/** Registre aqui as rotas de cada feature conforme elas forem criadas. */
const router = createBrowserRouter([
  {
    path: '/',
    element: <GamesPage />,
  },
  {
    path: '/status',
    element: <StatusPage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
