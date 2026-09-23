import { type PrismaService } from '../../database/prisma.service';
import { HealthService } from './health.service';

// PrismaService e sempre um objeto simples de funcoes: nenhum teste toca o banco real.
function createService(isHealthy: jest.Mock) {
  const prisma = { isHealthy } as unknown as PrismaService;
  return new HealthService(prisma);
}

describe('HealthService', () => {
  it('reporta ok/up quando o banco responde', async () => {
    const service = createService(jest.fn().mockResolvedValue(true));

    const result = await service.check();

    expect(result).toMatchObject({ status: 'ok', database: 'up' });
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('reporta error/down quando o banco nao responde', async () => {
    const service = createService(jest.fn().mockResolvedValue(false));

    await expect(service.check()).resolves.toMatchObject({ status: 'error', database: 'down' });
  });
});
