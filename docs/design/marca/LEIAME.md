# Logo do checkpoint: mascote Chek

Um cartucho de jogo com carinha e uma bandeira de checkpoint na cabeça. Cores do tema Estante.

| Cor | Valor | Uso |
| --- | --- | --- |
| Azul-noite | `#0b0f1a` | fundo, painel do rosto |
| Azul | `#4f8cff` (degradê `#8fbaff` a `#3f79f0`) | corpo do mascote |
| Dourado | `#ffd166` (degradê `#ffe08a` a `#ffbf47`) | bandeira, pinos, bochechas |
| Gelo | `#eef2ff` | olhos, boca, texto |

Nome: **Chek**. Fonte do nome "checkpoint": Outfit ExtraBold (Google Fonts).

## O que tem em cada pasta

| Pasta | Para quê |
| --- | --- |
| `1-projeto-web/` | Troca direta dos arquivos de `apps/web/public` (mesmos nomes de hoje) |
| `2-ios/` | Ícone do app iOS em todos os tamanhos. Quadrado e sem transparência: o iOS arredonda sozinho |
| `3-android/` | Play Store (512), ícones adaptativos (frente, fundo e monocromático do Android 13) e ícones antigos por densidade |
| `4-marca/` | O mascote sem fundo: para fundo escuro, fundo claro, preto e branco. SVG e PNG (1024, 512, 256) |
| `5-logo-com-nome/` | Logo horizontal com "checkpoint" ao lado, para fundo escuro e claro (PNG e SVG) |
| `6-redes-sociais/` | Imagem de compartilhamento (1200x630) e avatar (512 e 1024) |
| `fonte-svg/` | Arquivos-mestre em SVG, para gerar qualquer tamanho novo |

## Onde cada arquivo entra no checkpoint

Copie o conteúdo de `1-projeto-web/` por cima de `apps/web/public/`:

| Arquivo novo | Substitui em `apps/web/public/` |
| --- | --- |
| `favicon.svg` | `favicon.svg` |
| `icons/icon-192.png` e `icons/icon-512.png` | os de mesmo nome (ícone "any" do PWA) |
| `icons/icon-maskable-192.png` e `icons/icon-maskable-512.png` | os de mesmo nome (ícone "maskable" do Android) |
| `icons/apple-touch-icon-180.png` | o de mesmo nome (tela inicial do iPhone) |
| `icons/favicon-32.png` | o de mesmo nome |
| `icons/favicon-16.png`, `icons/favicon-48.png` e `favicon.ico` | novos (opcionais) |

O `theme_color` e o `background_color` do PWA já são `#0b0f1a`, iguais ao fundo do ícone. O manifest não precisa mudar.

Para a imagem de compartilhamento, coloque `6-redes-sociais/og-image-1200x630.png` em `apps/web/public/` e referencie no `index.html` com `<meta property="og:image" ...>` (o projeto ainda não tem essa tag).

## Regras de uso

- **Área de respiro:** deixe ao redor do mascote pelo menos a largura do olho dele.
- **Tamanho mínimo:** 24 px de altura para o mascote com rosto. Abaixo disso, use o favicon (`favicon-16.png`), onde o rosto vira só forma.
- **Fundo escuro:** use `chek-fundo-escuro`. **Fundo claro:** use `chek-fundo-claro`, que troca o mastro por um azul-escuro para não sumir.
- **Uma cor só** (carimbo, bordado, impressão): `chek-uma-cor-preto` ou `chek-uma-cor-branco`.
- Não gire, não estique e não troque as cores do mascote.

## Versões dos ícones

- **Quadrado (iOS, avatar):** fundo cheio, sem cantos. É o que a Apple e as redes pedem.
- **Arredondado (web, Play Store, ícones antigos):** cantos arredondados com transparência.
- **Maskable e adaptativo (Android):** o mascote é reduzido para caber no círculo de segurança, porque o sistema recorta o ícone em círculo, gota ou quadrado.

## Observação sobre o SVG com texto

Os arquivos `5-logo-com-nome/*.svg` usam a fonte Outfit como texto. Em máquinas sem a Outfit instalada, o texto cai numa fonte de reserva. Para uso final, prefira os PNGs, que já têm a fonte gravada.
