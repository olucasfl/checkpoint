import { Controller, Get, Header, Req } from '@nestjs/common';
import { type Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';

/**
 * TEMPORÁRIO, NÃO VAI PARA `main`: mede quantos proxies existem entre o cliente e a API (Vercel → Render)
 * para o `TRUST_PROXY_HOPS` ser um número medido, não um chute. Devolve SÓ o que a própria requisição
 * trouxe (o endereço do socket e uma lista fixa de cabeçalhos de proxy): nunca cookie, Authorization,
 * corpo, variável de ambiente nem dado de outro usuário. Sai da branch de diagnóstico depois da medição.
 */
const HEADERS_DE_PROXY = [
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-real-ip',
  'forwarded',
  'via',
  'x-vercel-id',
  'x-vercel-forwarded-for',
  'x-vercel-proxied-for',
  'x-vercel-deployment-url',
  'x-render-origin-server',
  'rndr-id',
  'cf-connecting-ip',
  'true-client-ip',
] as const;

@Controller('diag')
export class ProxyDiagController {
  @Public()
  @Get('proxy')
  @Header('cache-control', 'no-store')
  medir(@Req() req: Request): Record<string, unknown> {
    const headers: Record<string, string> = {};
    for (const nome of HEADERS_DE_PROXY) {
      const valor = req.headers[nome];
      if (valor !== undefined) {
        headers[nome] = Array.isArray(valor) ? valor.join(' | ') : valor;
      }
    }
    const xff = req.headers['x-forwarded-for'];
    const entradas = typeof xff === 'string' ? xff.split(',').map((parte) => parte.trim()) : [];
    return {
      socketRemoteAddress: req.socket.remoteAddress ?? null,
      reqIp: req.ip ?? null,
      reqIps: req.ips,
      xForwardedForEntradas: entradas,
      quantidadeDeEntradas: entradas.length,
      headersDeProxy: headers,
    };
  }
}
