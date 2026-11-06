// Interface text in English and Brazilian Portuguese. Messages are plain strings with {name}
// placeholders and no markup, so the html template tag escapes everything that ends up in a page.
// The Portuguese table is typed against the English one: a missing key is a compile error.

export type Lang = 'en' | 'pt-BR';
export const LANGS: readonly Lang[] = ['en', 'pt-BR'];

const en = {
  siteFooter: 'Open-source, non-custodial invoicing on Solana.',
  devnetBanner: 'Test network (devnet): no real money is involved.',
  languageLabel: 'Language',
  pageTitle: 'Invoice {amount} from {issuer}',

  statusOpen: 'Open',
  statusOverdue: 'Past due',
  statusPaid: 'Paid',
  pastDueNote: 'This invoice was due on {date}. You can still pay it.',

  invoiceFrom: 'Invoice from {issuer}',
  invoicePaid: 'Invoice paid',
  from: 'From',
  billedTo: 'Billed to',
  due: 'Due',

  payHeading: 'Pay with a Solana wallet',
  openInWallet: 'Open in wallet',
  payNote:
    'Pay with this button or the QR code. A payment typed in by hand to the address below does not mark this invoice as paid.',
  waiting: 'Waiting for your payment. This page updates by itself, usually within a minute.',
  detected: 'Payment received. Updating the page…',
  qrSummary: 'Pay from another device: show the QR code',
  qrLabel: 'Payment QR code',
  qrHint:
    'If your wallet says the address is not valid, open this page on your phone and tap Open in wallet instead.',
  newTo: 'New to {token}?',
  newStep1:
    'Install a Solana wallet app (for example Solflare) and put {token} in it, plus a small amount of SOL to pay the network fee.',
  newStep2: 'Tap Open in wallet. Your wallet shows the amount and the recipient.',
  newStep3: 'Check that they match this page, then approve. This page changes to Paid by itself.',

  detailsHeading: 'Payment details',
  network: 'Network',
  networkMain: 'Solana',
  networkDevnet: 'Solana devnet (test network)',
  token: 'Token',
  amount: 'Amount',
  recipient: 'Recipient address',
  copy: 'Copy',
  copied: 'Copied',
  detailsNoteMain:
    'The invoice is for {amount} on the Solana network. A payment in another token or on another network does not mark it as paid.',
  detailsNoteDevnet:
    'The invoice is for {amount} on the Solana devnet test network. A payment in another token or on another network does not mark it as paid.',

  paymentReceived: 'Payment received {date}.',
  viewTransaction: 'View the transaction',
  downloadReceipt: 'Download receipt (PDF)',
  verifyHeading: 'Verify this payment',
  tokenAddress: 'Token address',
  transaction: 'Transaction',
  verifyNote:
    'These details are recorded on the Solana blockchain, so anyone can check them in an explorer.',
};

export type MessageKey = keyof typeof en;

const ptBR: Record<MessageKey, string> = {
  siteFooter: 'Cobrança de código aberto, sem custódia, na Solana.',
  devnetBanner: 'Rede de teste (devnet): nenhum dinheiro real está envolvido.',
  languageLabel: 'Idioma',
  pageTitle: 'Fatura de {amount} de {issuer}',

  statusOpen: 'Em aberto',
  statusOverdue: 'Vencida',
  statusPaid: 'Paga',
  pastDueNote: 'Esta fatura venceu em {date}. Você ainda pode pagá-la.',

  invoiceFrom: 'Fatura de {issuer}',
  invoicePaid: 'Fatura paga',
  from: 'De',
  billedTo: 'Cobrado de',
  due: 'Vencimento',

  payHeading: 'Pague com uma carteira Solana',
  openInWallet: 'Abrir na carteira',
  payNote:
    'Pague com este botão ou com o QR code. Um pagamento digitado à mão para o endereço abaixo não marca esta fatura como paga.',
  waiting:
    'Aguardando o seu pagamento. Esta página se atualiza sozinha, em geral em menos de um minuto.',
  detected: 'Pagamento recebido. Atualizando a página…',
  qrSummary: 'Pagar de outro aparelho: mostrar o QR code',
  qrLabel: 'QR code de pagamento',
  qrHint:
    'Se a sua carteira disser que o endereço não é válido, abra esta página no celular e toque em Abrir na carteira.',
  newTo: 'Primeira vez com {token}?',
  newStep1:
    'Instale um app de carteira Solana (por exemplo, o Solflare) e coloque {token} nela, mais uma pequena quantia de SOL para pagar a taxa da rede.',
  newStep2: 'Toque em Abrir na carteira. A sua carteira mostra o valor e o destinatário.',
  newStep3: 'Confira se batem com esta página e aprove. Esta página muda para Paga sozinha.',

  detailsHeading: 'Dados do pagamento',
  network: 'Rede',
  networkMain: 'Solana',
  networkDevnet: 'Solana devnet (rede de teste)',
  token: 'Token',
  amount: 'Valor',
  recipient: 'Endereço do destinatário',
  copy: 'Copiar',
  copied: 'Copiado',
  detailsNoteMain:
    'A fatura é de {amount} na rede Solana. Um pagamento em outro token ou em outra rede não marca a fatura como paga.',
  detailsNoteDevnet:
    'A fatura é de {amount} na rede de teste Solana devnet. Um pagamento em outro token ou em outra rede não marca a fatura como paga.',

  paymentReceived: 'Pagamento recebido em {date}.',
  viewTransaction: 'Ver a transação',
  downloadReceipt: 'Baixar recibo (PDF)',
  verifyHeading: 'Verificar este pagamento',
  tokenAddress: 'Endereço do token',
  transaction: 'Transação',
  verifyNote:
    'Estes dados estão registrados na blockchain Solana, e qualquer pessoa pode conferi-los em um explorador.',
};

export const messages: Record<Lang, Record<MessageKey, string>> = { en, 'pt-BR': ptBR };

/** The message for a key, with {name} placeholders filled in. An unknown placeholder is left as is. */
export function t(lang: Lang, key: MessageKey, params: Record<string, string> = {}): string {
  return messages[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
}

function fromTag(tag: string | null | undefined): Lang | undefined {
  const lower = tag?.trim().toLowerCase();
  if (!lower) return undefined;
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return undefined;
}

/**
 * The language of a page: an explicit ?lang= wins, then the browser's Accept-Language by quality,
 * then English. Anything unrecognised falls through to the next rule instead of being an error.
 */
export function pickLang(requested: string | null | undefined, acceptLanguage?: string): Lang {
  const explicit = fromTag(requested);
  if (explicit) return explicit;
  if (acceptLanguage) {
    const ranked = acceptLanguage
      .split(',')
      .slice(0, 20)
      .map((part) => {
        const [tag = '', ...params] = part.split(';');
        const quality = params
          .map((param) => /^\s*q=([0-9.]+)\s*$/i.exec(param)?.[1])
          .find((value) => value !== undefined);
        return { tag, quality: quality === undefined ? 1 : Number(quality) };
      })
      .filter((entry) => entry.quality > 0)
      .sort((a, b) => b.quality - a.quality);
    for (const { tag } of ranked) {
      const lang = fromTag(tag);
      if (lang) return lang;
    }
  }
  return 'en';
}
