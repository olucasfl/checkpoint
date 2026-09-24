import { useSyncExternalStore } from 'react';
import { connectivity, type ConnectionState } from '@/shared/lib/connectivity';

/** Estado da conexão com a API, de um store externo: vários componentes leem o mesmo valor. */
export function useConnectivity(): ConnectionState {
  return useSyncExternalStore(connectivity.subscribe, connectivity.getState);
}
