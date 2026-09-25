import { avatarUrlSeguro, capaOficialUrl, perfilUrlSeguro } from './steam-urls';

describe('capaOficialUrl', () => {
  it('é a capa em retrato na CDN da Steam, pelo appid', () => {
    expect(capaOficialUrl('1794680')).toBe(
      'https://cdn.cloudflare.steamstatic.com/steam/apps/1794680/library_600x900.jpg',
    );
  });
});

describe('avatarUrlSeguro (CA-16)', () => {
  it.each([
    'https://avatars.steamstatic.com/0000_full.jpg',
    'https://avatars.akamai.steamstatic.com/0000_full.jpg',
    'https://steamstatic.com/x.jpg',
    'https://AVATARS.STEAMSTATIC.COM/x.jpg',
  ])('aceita %s', (url) => {
    expect(avatarUrlSeguro(url)).not.toBeNull();
  });

  it.each([
    ['http (sem https)', 'http://avatars.steamstatic.com/x.jpg'],
    ['outro host', 'https://evil.example/steamstatic.com/x.jpg'],
    ['sufixo enganoso', 'https://steamstatic.com.evil.example/x.jpg'],
    ['prefixo enganoso', 'https://evilsteamstatic.com/x.jpg'],
    ['usuário na URL (o host real é outro)', 'https://avatars.steamstatic.com@evil.example/x.jpg'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/png;base64,AAAA'],
    ['texto que não é URL', 'nao-e-url'],
    ['vazio', ''],
    ['null', null],
  ])('recusa %s', (_nome, url) => {
    expect(avatarUrlSeguro(url)).toBeNull();
  });
});

describe('perfilUrlSeguro', () => {
  it('aceita o perfil em steamcommunity.com', () => {
    expect(
      perfilUrlSeguro('https://steamcommunity.com/profiles/STEAMID_SINTETICO/'),
    ).not.toBeNull();
  });

  it.each([
    'http://steamcommunity.com/id/x',
    'https://steamcommunity.com.evil.example/id/x',
    'https://evil.example/steamcommunity.com',
    'javascript:alert(1)',
    '',
  ])('recusa %j', (url) => {
    expect(perfilUrlSeguro(url)).toBeNull();
  });
});
