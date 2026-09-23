import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';

/** Registre aqui as rotas de cada feature conforme elas forem criadas. */
const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
