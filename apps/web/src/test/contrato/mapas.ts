import {
  type AuthResponse,
  type ContaVinculada,
  type DadosJogoPlataforma,
  type EncerrarOutrasSessoesResponse,
  type Game,
  type GameRatingKey,
  type ItemBiblioteca,
  type JogoParecido,
  type PerfilPlataforma,
  type SessaoAtiva,
  type Usuario,
} from '@checkpoint/shared';
import { type Tipo } from './forma';

/**
 * Os mapas de forma do contrato com a API, em espelho dos de `apps/api/src/contract/contrato-web.http.spec.ts`.
 * Cada um é um `Record<keyof T, Tipo>`: uma chave nova (ou removida) no `@checkpoint/shared` não compila até o mapa
 * acompanhar. Lá, a API real é conferida contra eles; aqui, os dados que os testes e o mock do navegador usam.
 */
export const NOTAS: Record<GameRatingKey, Tipo> = {
  gameplay: 'number?',
  historia: 'number?',
  graficos: 'number?',
  trilhaSonora: 'number?',
  performance: 'number?',
};

export const DADOS_PLATAFORMA: Record<keyof DadosJogoPlataforma, Tipo> = {
  provedor: 'string',
  idExterno: 'string',
  minutosJogados: 'number',
  ultimaVezJogadoEm: 'iso?',
  conquistasTotal: 'number?',
  conquistasDesbloqueadas: 'number?',
  capaUrl: 'string?',
  atualizadoEm: 'iso',
};

export const GAME: Record<keyof Game, Tipo> = {
  id: 'uuid',
  titulo: 'string',
  plataforma: 'string?',
  status: 'string',
  notas: { objeto: NOTAS },
  notaMedia: 'number?',
  descricao: 'string?',
  capaUrl: 'string?',
  criadoEm: 'iso',
  atualizadoEm: 'iso',
  dadosPlataforma: { lista: DADOS_PLATAFORMA },
};

export const CONTA: Record<keyof ContaVinculada, Tipo> = {
  provedor: 'string',
  idExterno: 'string',
  nomeExibicao: 'string',
  vinculadaEm: 'iso',
};

export const JOGO_PARECIDO: Record<keyof JogoParecido, Tipo> = {
  id: 'uuid',
  titulo: 'string',
  plataforma: 'string?',
};

export const ITEM_BIBLIOTECA: Record<keyof ItemBiblioteca, Tipo> = {
  idExterno: 'string',
  titulo: 'string',
  capaUrl: 'string?',
  minutosJogados: 'number',
  ultimaVezJogadoEm: 'iso?',
  jogosParecidos: { lista: JOGO_PARECIDO },
  vinculadoA: { objeto: JOGO_PARECIDO, nulo: true },
};

export const PERFIL: Record<keyof PerfilPlataforma, Tipo> = {
  provedor: 'string',
  nomeExibicao: 'string',
  avatarUrl: 'string?',
  perfilUrl: 'string?',
  totalJogos: 'number',
  minutosTotais: 'number',
  maisJogados: {
    lista: { idExterno: 'string', titulo: 'string', capaUrl: 'string?', minutosJogados: 'number' },
  },
  conquistas: {
    objeto: { desbloqueadas: 'number', total: 'number', jogosVinculados: 'number' },
  },
  consultadoEm: 'iso',
};

export const USUARIO: Record<keyof Usuario, Tipo> = {
  id: 'uuid',
  nome: 'string',
  email: 'string',
  criadoEm: 'iso',
};

export const AUTH_RESPONSE: Record<keyof AuthResponse, Tipo> = {
  accessToken: 'string',
  usuario: { objeto: USUARIO },
};

export const SESSAO: Record<keyof SessaoAtiva, Tipo> = {
  id: 'uuid',
  dispositivo: 'string',
  criadoEm: 'iso',
  ultimoUsoEm: 'iso',
  atual: 'boolean',
};

export const ENCERRAR_OUTRAS: Record<keyof EncerrarOutrasSessoesResponse, Tipo> = {
  encerradas: 'number',
};
