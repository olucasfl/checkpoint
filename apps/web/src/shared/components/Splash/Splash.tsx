import { useEffect, useState, type CSSProperties } from 'react';
import { Chek } from '@/shared/components/Chek/Chek';
import { OverlayPortal } from '@/shared/components/OverlayPortal';
import { useMovimentoReduzido } from '@/shared/hooks/use-movimento-reduzido';
import { deveMostrarSplash, esperarFonteDosTitulos, marcarSplashVisto } from './abertura';
import { Glifo, type TipoDeGlifo } from './Glifos';

const NOME = 'Checkpoint';
const PINOS = [0, 1, 2, 3, 4, 5];

/** A linha do tempo (ms, desde que a fonte carregou). Os atrasos das animações estão em `index.css` (`.splash-*`). */
export const TEMPO = {
  acorda: 900,
  sai: 2900,
  saiReduzido: 900,
  saida: 600,
  pularDepoisDe: 700,
} as const;

interface Peca {
  tipo: TipoDeGlifo;
  /** Onde a peça pousa (% da tela) e de onde ela vem (deslocamento inicial e giro). */
  x: string;
  y: string;
  dx: string;
  dy: string;
  giro: string;
  tamanho: number;
  cor: string;
  atraso: number;
}

const PECAS: readonly Peca[] = [
  {
    tipo: 'estrela',
    x: '13%',
    y: '15%',
    dx: '-45vw',
    dy: '-25vh',
    giro: '-200deg',
    tamanho: 30,
    cor: 'text-ouro',
    atraso: 200,
  },
  {
    tipo: 'controle',
    x: '72%',
    y: '12%',
    dx: '50vw',
    dy: '-30vh',
    giro: '160deg',
    tamanho: 42,
    cor: 'text-destaque',
    atraso: 320,
  },
  {
    tipo: 'trofeu',
    x: '82%',
    y: '43%',
    dx: '55vw',
    dy: '5vh',
    giro: '120deg',
    tamanho: 34,
    cor: 'text-ouro',
    atraso: 440,
  },
  {
    tipo: 'direcional',
    x: '7%',
    y: '47%',
    dx: '-55vw',
    dy: '8vh',
    giro: '-140deg',
    tamanho: 32,
    cor: 'text-status-jogando',
    atraso: 560,
  },
  {
    tipo: 'check',
    x: '19%',
    y: '77%',
    dx: '-40vw',
    dy: '35vh',
    giro: '-90deg',
    tamanho: 34,
    cor: 'text-status-zerado',
    atraso: 680,
  },
  {
    tipo: 'coracao',
    x: '71%',
    y: '75%',
    dx: '45vw',
    dy: '35vh',
    giro: '110deg',
    tamanho: 30,
    cor: 'text-erro',
    atraso: 800,
  },
  {
    tipo: 'moeda',
    x: '45%',
    y: '6%',
    dx: '0vw',
    dy: '-40vh',
    giro: '240deg',
    tamanho: 26,
    cor: 'text-ouro',
    atraso: 920,
  },
  {
    tipo: 'botao',
    x: '50%',
    y: '89%',
    dx: '5vw',
    dy: '40vh',
    giro: '-180deg',
    tamanho: 26,
    cor: 'text-texto-suave',
    atraso: 1040,
  },
];

/**
 * A abertura do app instalado: o Chek dorme, cai no lugar e acorda; as letras do nome chegam uma a uma, as seis
 * peças do conector acendem como uma barra de carregamento e peças do mundo dos jogos pousam ao redor. Só existe
 * como PWA (ou com `?splash=1`), uma vez por abertura; um toque a encerra. Com movimento reduzido vira uma tela
 * estática de menos de 1 s. Tudo anima só `opacity` e `transform` (ver `.splash-*` em `index.css`).
 */
export function Splash() {
  const [presente, setPresente] = useState(deveMostrarSplash);
  const [saindo, setSaindo] = useState(false);
  const [acordado, setAcordado] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [podePular, setPodePular] = useState(false);
  const reduzido = useMovimentoReduzido();

  useEffect(() => {
    if (!presente) {
      return;
    }
    marcarSplashVisto();
    // Enquanto a abertura está na tela, o app atrás não recebe toque nem foco.
    const raiz = document.getElementById('root');
    raiz?.setAttribute('inert', '');
    return () => raiz?.removeAttribute('inert');
  }, [presente]);

  useEffect(() => {
    if (!presente) {
      return;
    }
    let ativo = true;
    void esperarFonteDosTitulos(900).then(() => {
      if (ativo) {
        setPronto(true);
      }
    });
    return () => {
      ativo = false;
    };
  }, [presente]);

  useEffect(() => {
    if (!presente || !pronto) {
      return;
    }
    const timers = [
      setTimeout(() => setAcordado(true), TEMPO.acorda),
      setTimeout(() => setPodePular(true), TEMPO.pularDepoisDe),
      setTimeout(() => setSaindo(true), reduzido ? TEMPO.saiReduzido : TEMPO.sai),
    ];
    return () => timers.forEach(clearTimeout);
  }, [presente, pronto, reduzido]);

  useEffect(() => {
    if (!saindo) {
      return;
    }
    const timer = setTimeout(() => setPresente(false), reduzido ? 0 : TEMPO.saida);
    return () => clearTimeout(timer);
  }, [saindo, reduzido]);

  if (!presente) {
    return null;
  }

  const pular = () => {
    if (podePular) {
      setSaindo(true);
    }
  };

  return (
    <OverlayPortal>
      <div
        role="status"
        data-splash
        data-pronto={pronto}
        onClick={pular}
        className={`splash ${saindo ? 'splash-saindo' : ''}`}
      >
        <p className="sr-only">Abrindo o Checkpoint</p>
        {pronto && (
          <>
            <div aria-hidden="true" className="splash-halo" />
            {PECAS.map((peca) => (
              <span
                key={peca.tipo}
                aria-hidden="true"
                data-glifo={peca.tipo}
                className={`splash-glifo ${peca.cor}`}
                style={
                  {
                    '--x': peca.x,
                    '--y': peca.y,
                    '--dx': peca.dx,
                    '--dy': peca.dy,
                    '--giro': peca.giro,
                    '--atraso': `${peca.atraso}ms`,
                    width: peca.tamanho,
                    height: peca.tamanho,
                  } as CSSProperties
                }
              >
                <Glifo tipo={peca.tipo} />
              </span>
            ))}

            <div aria-hidden="true" className="splash-chek">
              <div className={acordado && !reduzido ? 'splash-acorda' : undefined}>
                <Chek
                  expressao={acordado || reduzido ? 'feliz' : 'dormindo'}
                  altura={168}
                  animado={acordado}
                />
              </div>
            </div>

            <div aria-hidden="true" className="splash-nome">
              <span className="font-display text-[44px] font-extrabold leading-none tracking-[-0.02em] sm:text-[56px]">
                {NOME.split('').map((letra, indice) => (
                  <span
                    key={indice}
                    className="splash-letra"
                    style={{ '--i': indice } as CSSProperties}
                  >
                    {letra}
                  </span>
                ))}
              </span>
              <span className="splash-brilho" />
            </div>

            <p
              aria-hidden="true"
              className="splash-sobe m-0 text-[16px] font-semibold text-texto-suave"
            >
              Seu registro de jogos
            </p>

            <div aria-hidden="true" className="splash-pinos">
              {PINOS.map((indice) => (
                <span
                  key={indice}
                  className="splash-pino"
                  style={{ '--i': indice } as CSSProperties}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </OverlayPortal>
  );
}
