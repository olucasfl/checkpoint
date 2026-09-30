/**
 * O envio de e-mail falhou (rede, timeout ou resposta não-2xx do Brevo). Erro tipado em vez de `false`:
 * quem chama decide o que fazer (o registro segue, o reenvio vira 502, o "esqueci a senha" engole).
 * Nunca carrega a resposta do Brevo nem o corpo do e-mail.
 */
export class MailIndisponivelError extends Error {
  constructor() {
    super('O serviço de e-mail está indisponível.');
    this.name = 'MailIndisponivelError';
  }
}
