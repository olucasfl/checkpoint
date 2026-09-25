# Estante de console — referência visual

Direção de design aprovada para substituir o tema "Neon arcade". Origem: canvas
https://claude.ai/artifact/LHq2bxFPkwPhCdbhUYTnNT (privado; esta pasta é a cópia versionada, para quem não
consegue abri-lo).

Cada `*.dc.html` é uma tela desenhada em HTML com estilos inline (abre num navegador, mas o `support.js` do
canvas não está aqui, então os `{{...}}` e as listas repetidas aparecem sem dados). Serve para ler as CORES,
TIPOGRAFIA, MEDIDAS e ESTRUTURA. Não é código do app.

| Arquivo | Tela |
| --- | --- |
| `Main.dc.html` | Catálogo, desktop (1280 px): destaque + prateleiras |
| `CatalogoMobile.dc.html` | Catálogo, celular (390 px), com a barra inferior |
| `Detalhe.dc.html` | Detalhe do jogo com o bloco Steam e as conquistas |
| `Formulario.dc.html` | Formulário "Novo jogo" com avaliação e ligação à Steam |
| `canvas.json` | Posição e tamanho das telas no canvas |

Textos, jogos, horas e nomes de conquistas são exemplos.

## Tokens

Fundo `#0b0f1a` · painel `#121829` · painel-2 `#0f1524` · borda `#1e2640` · borda de controle `#3a4468` ·
texto `#eef2ff` · texto suave `#a3abc7` · acento `#4f8cff` (texto ESCURO `#0b0f1a` sobre ele) ·
Jogando `#7fb0ff` · Quero jogar `#ffd166` · Zerado `#5ee6a8` · conquistas/estrela `#ffd166`.
Fontes: Outfit (títulos, números) e Manrope (corpo). Ícones: Material Symbols Rounded.
