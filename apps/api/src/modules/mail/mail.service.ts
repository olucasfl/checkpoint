import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_MAIL_FROM_NAME, type EnvironmentVariables } from '../../config/env.validation';
import { MailIndisponivelError } from './mail.errors';

export const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
export const MAIL_REQUEST_TIMEOUT_MS = 10_000;

export interface Destinatario {
  email: string;
  nome: string;
}

/** Escapa o que vem do usuário antes de entrar no HTML do e-mail (o nome é texto livre). */
function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Envia e-mail transacional pela API REST do Brevo com o `fetch` nativo (mesmo mecanismo do `SteamClient`:
 * nenhuma dependência nova). Qualquer falha vira `MailIndisponivelError`. Nada do que passa por aqui vai
 * para o log além do tipo do erro e do status HTTP: o corpo tem o link com o token e a chave viaja no
 * cabeçalho.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  /** O link vai para o frontend, que confirma por `fetch`: um pré-carregamento do link não consome o token. */
  async enviarVerificacaoDeEmail(para: Destinatario, token: string): Promise<void> {
    const link = this.link('/verificar-email', token);
    await this.enviar(para, 'Confirme seu e-mail no Checkpoint', {
      titulo: 'Confirme seu e-mail',
      texto:
        'Clique no botão abaixo para confirmar seu e-mail e entrar no Checkpoint. O link vale por 24 horas.',
      botao: 'Confirmar e-mail',
      link,
      rodape: 'Se você não criou uma conta no Checkpoint, ignore este e-mail.',
      nome: para.nome,
    });
  }

  async enviarRedefinicaoDeSenha(para: Destinatario, token: string): Promise<void> {
    const link = this.link('/redefinir-senha', token);
    await this.enviar(para, 'Redefina sua senha do Checkpoint', {
      titulo: 'Redefina sua senha',
      texto:
        'Clique no botão abaixo para escolher uma senha nova. O link vale por 30 minutos e só pode ser usado uma vez.',
      botao: 'Redefinir senha',
      link,
      rodape:
        'Se você não pediu para redefinir a senha, ignore este e-mail: sua senha continua a mesma.',
      nome: para.nome,
    });
  }

  private link(caminho: string, token: string): string {
    const base = this.config.get('WEB_PUBLIC_URL', { infer: true });
    return `${base}${caminho}?token=${encodeURIComponent(token)}`;
  }

  private async enviar(
    para: Destinatario,
    assunto: string,
    corpo: {
      titulo: string;
      texto: string;
      botao: string;
      link: string;
      rodape: string;
      nome: string;
    },
  ): Promise<void> {
    const nomeRemetente =
      this.config.get('MAIL_FROM_NAME', { infer: true }) || DEFAULT_MAIL_FROM_NAME;
    const payload = {
      sender: { name: nomeRemetente, email: this.config.get('MAIL_FROM_EMAIL', { infer: true }) },
      to: [{ email: para.email, name: para.nome }],
      subject: assunto,
      htmlContent: this.html(corpo),
      textContent: `${corpo.titulo}\n\n${corpo.texto}\n\n${corpo.link}\n\n${corpo.rodape}`,
    };

    let response: Response;
    try {
      response = await fetch(BREVO_SEND_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': this.config.get('BREVO_API_KEY', { infer: true }),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(MAIL_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Só o tipo do erro (TimeoutError, TypeError…): o objeto pode carregar a requisição, e com ela a chave.
      const kind = error instanceof Error ? error.name : 'erro desconhecido';
      this.logger.error(`Brevo sem resposta: ${kind}`);
      throw new MailIndisponivelError();
    }

    if (!response.ok) {
      // 401 é chave recusada (configuração), o resto é falha do Brevo ou remetente não verificado.
      this.logger.error(`Brevo respondeu HTTP ${response.status}`);
      throw new MailIndisponivelError();
    }
  }

  private html(corpo: {
    titulo: string;
    texto: string;
    botao: string;
    link: string;
    rodape: string;
    nome: string;
  }): string {
    const link = escapeHtml(corpo.link);
    return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1b2233">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(corpo.titulo)}</h1>
<p style="margin:0 0 12px">Olá, ${escapeHtml(corpo.nome)}.</p>
<p style="margin:0 0 24px;line-height:1.5">${escapeHtml(corpo.texto)}</p>
<p style="margin:0 0 24px"><a href="${link}" style="background:#4f8cff;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block">${escapeHtml(corpo.botao)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#5b6477">Se o botão não funcionar, copie este endereço no navegador:<br>${link}</p>
<p style="margin:0;font-size:13px;color:#5b6477">${escapeHtml(corpo.rodape)}</p>
</div></body></html>`;
  }
}
