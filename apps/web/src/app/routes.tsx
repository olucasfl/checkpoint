import { type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/app/layout/AppLayout';
import { AuthLayout } from '@/app/layout/AuthLayout';
import { RequireAuth } from '@/app/layout/RequireAuth';
import { GameDetailPage } from '@/pages/GameDetailPage';
import { GamesPage } from '@/pages/GamesPage';
import { LoginPage } from '@/pages/LoginPage';
import { NaoEncontradaPage } from '@/pages/NaoEncontradaPage';
import { PerfilPage } from '@/pages/PerfilPage';
import { RegistroPage } from '@/pages/RegistroPage';
import { StatusPage } from '@/pages/StatusPage';
import { TrocarSenhaPage } from '@/pages/TrocarSenhaPage';

/**
 * As rotas do app, à parte do roteador do navegador para os testes usarem um roteador em memória.
 * Registre aqui as rotas de cada feature conforme elas forem criadas. As telas logadas ficam dentro do
 * `RequireAuth` e do `AppLayout` (fundo, navegação do topo e barra inferior); `/status` é público
 * (diagnóstico); `/login` e `/registro` ficam no `AuthLayout` (sem barra).
 */
export const routes: RouteObject[] = [
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <GamesPage /> },
          { path: '/jogos/:id', element: <GameDetailPage /> },
          { path: '/perfil', element: <PerfilPage /> },
          { path: '/perfil/senha', element: <TrocarSenhaPage /> },
          { path: '*', element: <NaoEncontradaPage /> },
        ],
      },
    ],
  },
  {
    element: <AppLayout />,
    children: [{ path: '/status', element: <StatusPage /> }],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/registro', element: <RegistroPage /> },
    ],
  },
];
