// The public home page of the project (quitado.finance): what Quitado is and what it does.
// Served at "/" only when the request host is the configured site host; see app.ts.
//
// Everything on it is a claim about the software, so each sentence below is something the code or
// the docs back up. Brazilian tax helpers are planned and said to be planned, never implied.
import { displayAmount, formatDate } from './format.ts';
import { html, raw, type Raw } from './html.ts';
import { t, type Lang } from './i18n.ts';

const REPO = 'https://github.com/quitado-app/quitado';
const DOCS = `${REPO}/blob/main/docs`;

export interface LandingContext {
  lang: Lang;
  /** Unix ms; the example invoice falls due two weeks after it. */
  now: number;
  utcOffsetMinutes: number;
  /** Public origin of the site, without a trailing slash, e.g. https://quitado.finance. */
  siteUrl: string;
}

interface Link {
  label: string;
  href: string;
}

interface Copy {
  htmlTitle: string;
  description: string;
  skip: string;
  githubLabel: string;
  hero: {
    title: string;
    lead: string;
    promise: string;
    guide: Link;
    code: Link;
    early: string;
    tokens: string;
  };
  sample: {
    caption: string;
    ariaLabel: string;
    from: string;
    fromValue: string;
    billedTo: string;
    billedToValue: string;
    due: string;
    network: string;
    networkValue: string;
    recipient: string;
    recipientValue: string;
    description: string;
    descriptionValue: string;
    events: [string, string, string, string];
  };
  how: {
    heading: string;
    steps: { title: string; body: string }[];
    receipt: {
      caption: string;
      title: string;
      paid: string;
      rows: { label: string; value: string }[];
      verify: string;
    };
  };
  limits: {
    heading: string;
    doesHeading: string;
    does: string[];
    doesNotHeading: string;
    doesNot: string[];
  };
  verify: {
    heading: string;
    intro: string;
    rows: { term: string; text: string; link: Link }[];
  };
  run: {
    heading: string;
    intro: string;
    needs: string[];
    commandNote: string;
    copy: string;
    copied: string;
    guide: Link;
  };
  faq: { heading: string; items: { q: string; a: string }[] };
  footer: { meaning: string; license: string; links: Link[] };
}

const COMMAND = [
  'git clone https://github.com/quitado-app/quitado.git',
  'cd quitado',
  'cp .env.example .env',
  'docker compose up -d',
].join('\n');

const en: Copy = {
  htmlTitle: 'Quitado: invoice in USDC and USDT, paid straight into your wallet',
  description:
    'Open-source, non-custodial invoicing on Solana for freelancers in Brazil. Send a link, your client pays, the invoice marks itself paid. Quitado holds no money and charges no fee.',
  skip: 'Skip to the content',
  githubLabel: 'GitHub',
  hero: {
    title: 'Bill in USDC or USDT. The money goes straight to your wallet.',
    lead: 'Quitado is open-source invoicing for people who work for themselves. You create an invoice and send a link. Your client pays from their Solana wallet, and the invoice turns paid as soon as the payment is confirmed on-chain.',
    promise: 'Quitado never holds your money or your keys, and it charges no fee.',
    guide: { label: 'Read the guide and run your own', href: `${DOCS}/deploy.md` },
    code: { label: 'See the code on GitHub', href: REPO },
    early: 'Early-stage software. Start with small amounts.',
    tokens:
      'USDC and USDT are digital dollars: tokens built to stay worth one US dollar. Solana is the network they move on.',
  },
  sample: {
    caption: 'Illustrative example, not a real charge',
    ariaLabel:
      'Example of an invoice for 1,250.00 USDC. It starts open and ends paid, with a receipt.',
    from: 'From',
    fromValue: 'Example Studio',
    billedTo: 'Billed to',
    billedToValue: 'Example Client Ltd.',
    due: 'Due',
    network: 'Network',
    networkValue: 'Solana',
    recipient: 'Pays into',
    recipientValue: 'your wallet address',
    description: 'For',
    descriptionValue: 'Brand identity, part 1',
    events: [
      'Invoice created, link sent',
      'Client pays from their wallet',
      'Payment confirmed on-chain',
      'PDF receipt available',
    ],
  },
  how: {
    heading: 'How it works',
    steps: [
      {
        title: 'You create the invoice',
        body: 'Fill in the client, a description, the amount in USDC or USDT and a due date. Quitado makes a link for that one invoice, and you send it by email or chat.',
      },
      {
        title: 'Your client pays from their phone',
        body: 'They open the link and see who is asking, how much, on which network and into which address. They scan the QR code or tap the button that opens their wallet. No account needed.',
      },
      {
        title: 'The server notices by itself',
        body: 'Every invoice carries a unique reference inside the payment. Quitado checks the blockchain for that reference, confirms that your balance of the token went up by the invoice amount, and waits for the transaction to become final. That usually takes 15 to 40 seconds. You mark nothing by hand.',
      },
      {
        title: 'Both of you keep the proof',
        body: 'The invoice turns paid, and your client can download a PDF receipt with the transaction signature, a link and a QR code to check it on a Solana explorer. The receipt proves the payment. It is not a nota fiscal.',
      },
    ],
    receipt: {
      caption: 'Example of what the receipt contains',
      title: 'Payment receipt',
      paid: 'Paid',
      rows: [
        { label: 'From', value: 'Example Studio' },
        { label: 'Billed to', value: 'Example Client Ltd.' },
        { label: 'Network', value: 'Solana' },
        { label: 'Transaction', value: 'the full signature of the transaction' },
      ],
      verify: 'Plus a link and a QR code that open the transaction on a block explorer.',
    },
  },
  limits: {
    heading: 'What it does and what it does not',
    doesHeading: 'It does',
    does: [
      'Bill in USDC and USDT on Solana, with the exact amount and no rounding.',
      'Send the money straight to your wallet address. You only give it the public address.',
      'Notice the payment by itself and update your client’s page right away.',
      'Make a PDF receipt that carries the transaction signature.',
      'Show your open, paid and overdue invoices, and the total received per token, counted from your own database.',
      'Show your client’s page in English or Portuguese, following their browser.',
    ],
    doesNotHeading: 'It does not',
    doesNot: [
      'Hold money or keys. There is no balance in Quitado and no withdrawal.',
      'Charge a fee. The Solana network charges a small fee to whoever pays, and Quitado receives none of it.',
      'Convert to reais or Pix. That happens outside, at an authorized exchange.',
      'Issue a nota fiscal. The exchange-rate reference (PTAX) and carnê-leão support are planned and do not exist yet.',
      'Add partial payments together. Paying less than the invoice does not settle it. Paying more settles it, and the amount received is recorded.',
      'Stop the token issuers from freezing USDC or USDT. That is a property of the tokens.',
      'Send usage data to anyone. There is no telemetry, tracker, outside font or outside script. It only talks to the Solana RPC provider you choose.',
    ],
  },
  verify: {
    heading: 'Everything can be checked',
    intro:
      'You do not have to take our word for it. Each of these is something you can open and read.',
    rows: [
      {
        term: 'Open source, Apache-2.0',
        text: 'Read what the server does before you trust it with an invoice.',
        link: { label: 'Source code', href: REPO },
      },
      {
        term: 'Every payment is public',
        text: 'A paid invoice points to a transaction. Paste its signature into any Solana explorer to see the amount and where it went.',
        link: { label: 'About receipts', href: `${DOCS}/receipts.md` },
      },
      {
        term: 'Detection is documented',
        text: 'How a payment is recognised, and what happens when it is too small, in another token or failed.',
        link: { label: 'Payment detection', href: `${DOCS}/payment-detection.md` },
      },
      {
        term: 'Security choices are written down',
        text: 'One access password with a limit on attempts, protection against injected code, and no web framework to depend on. Found a flaw? The security policy says how to report it privately.',
        link: { label: 'Security notes', href: `${DOCS}/web.md` },
      },
    ],
  },
  run: {
    heading: 'Run your own',
    intro:
      'There is no hosted service: each person runs their own instance, with one owner and one wallet. You need three things.',
    needs: [
      'A Solana wallet of your own. Quitado only needs its public address, never the recovery phrase.',
      'A computer or server with Docker, reachable on the internet over https.',
      'A Solana RPC provider, the service that gives your server access to the network. The free public one is too limited for real use.',
    ],
    commandNote: 'Fill in the .env file before starting. The guide explains every setting.',
    copy: 'Copy',
    copied: 'Copied',
    guide: { label: 'Read the guide and run your own', href: `${DOCS}/deploy.md` },
  },
  faq: {
    heading: 'Questions',
    items: [
      {
        q: 'Do I need an account with Quitado?',
        a: 'No. There is no account and no hosted service. You run your own instance, protected by an access secret only you know, and you give it the public address of your wallet.',
      },
      {
        q: 'What are USDC and USDT?',
        a: 'Digital currencies issued by companies and designed to stay worth one US dollar. They move on the Solana network and live in wallets such as Phantom, Solflare and Backpack.',
      },
      {
        q: 'Does my client need a wallet?',
        a: 'Yes, a Solana wallet holding USDC or USDT, plus a little SOL to pay the network fee. For someone who has never paid this way, the payment page has a short explanation.',
      },
      {
        q: 'How long until the invoice shows as paid?',
        a: 'Usually 15 to 40 seconds after the payment. Quitado waits for the transaction to become final on the blockchain, so a paid invoice is never undone.',
      },
      {
        q: 'What if the client pays too little, or too much?',
        a: 'Paying less does not settle the invoice, and two partial payments are not added together. Paying more settles it, and the amount actually received is recorded.',
      },
      {
        q: 'Can I get paid in reais or Pix?',
        a: 'Quitado does not convert. To turn the money into reais you use an authorized exchange, outside the system.',
      },
      {
        q: 'What about taxes?',
        a: 'Quitado does not give tax advice, and the receipt is not a nota fiscal. Talk to your accountant about how to declare what you receive.',
      },
      {
        q: 'Can I use it with real clients today?',
        a: 'The project is at an early stage and not yet recommended for production use. Start with a small amount, run the full test from another wallet, and read the code, which is open.',
      },
      {
        q: 'How much does it cost?',
        a: 'Quitado charges nothing. You pay only for what you choose to run it on, such as hosting and an RPC provider. The Solana network charges a small fee to whoever makes the payment.',
      },
    ],
  },
  footer: {
    meaning: '“Quitado” is Portuguese for settled, paid off.',
    license: 'Open source under the Apache-2.0 license.',
    links: [
      { label: 'Source code', href: REPO },
      { label: 'Guide', href: `${DOCS}/deploy.md` },
      { label: 'Security policy', href: `${REPO}/blob/main/SECURITY.md` },
    ],
  },
};

const ptBR: Copy = {
  htmlTitle: 'Quitado: cobre em USDC e USDT e receba direto na sua carteira',
  description:
    'Cobrança de código aberto, sem custódia, na Solana, para quem trabalha por conta própria no Brasil. Você manda um link, o cliente paga e a fatura aparece como paga. O Quitado não guarda dinheiro e não cobra taxa.',
  skip: 'Ir para o conteúdo',
  githubLabel: 'GitHub',
  hero: {
    title: 'Cobre em USDC ou USDT. O dinheiro cai direto na sua carteira.',
    lead: 'O Quitado é um sistema de cobrança de código aberto para quem trabalha por conta própria. Você cria a fatura e manda o link. Seu cliente paga pela carteira Solana dele, e a fatura vira paga assim que o pagamento é confirmado na blockchain.',
    promise: 'O Quitado nunca guarda seu dinheiro nem suas chaves, e não cobra taxa.',
    guide: { label: 'Ler o guia e rodar o seu', href: `${DOCS}/pt-BR/guia-rapido.md` },
    code: { label: 'Ver o código no GitHub', href: REPO },
    early: 'Software em estágio inicial. Comece com valores pequenos.',
    tokens:
      'USDC e USDT são dólares digitais: moedas feitas para valer um dólar americano. A Solana é a rede em que elas circulam.',
  },
  sample: {
    caption: 'Exemplo ilustrativo, não é uma cobrança real',
    ariaLabel: 'Exemplo de fatura de 1.250,00 USDC. Começa em aberto e termina paga, com recibo.',
    from: 'De',
    fromValue: 'Estúdio Exemplo',
    billedTo: 'Cobrado de',
    billedToValue: 'Cliente Exemplo Ltda.',
    due: 'Vencimento',
    network: 'Rede',
    networkValue: 'Solana',
    recipient: 'Recebe em',
    recipientValue: 'o endereço da sua carteira',
    description: 'Referente a',
    descriptionValue: 'Identidade visual, parcela 1',
    events: [
      'Fatura criada, link enviado',
      'Cliente paga pela carteira',
      'Pagamento confirmado na blockchain',
      'Recibo em PDF disponível',
    ],
  },
  how: {
    heading: 'Como funciona',
    steps: [
      {
        title: 'Você cria a fatura',
        body: 'Informe o cliente, uma descrição, o valor em USDC ou USDT e o vencimento. O Quitado gera um link só dessa fatura, e você manda por e-mail ou mensagem.',
      },
      {
        title: 'Seu cliente paga pelo celular',
        body: 'Ele abre o link e vê quem está cobrando, quanto, em qual rede e para qual endereço. Paga escaneando o QR code ou tocando no botão que abre a carteira dele. Não precisa criar conta.',
      },
      {
        title: 'O servidor percebe sozinho',
        body: 'Cada fatura leva uma referência única dentro do pagamento. O Quitado procura essa referência na blockchain, confere se o seu saldo do token subiu o valor da fatura e espera a transação ficar definitiva. Costuma levar de 15 a 40 segundos. Você não marca nada à mão.',
      },
      {
        title: 'Os dois ficam com a prova',
        body: 'A fatura vira paga, e seu cliente pode baixar um recibo em PDF com a assinatura da transação, um link e um QR code para conferir em um explorador da Solana. O recibo prova o pagamento. Ele não é nota fiscal.',
      },
    ],
    receipt: {
      caption: 'Exemplo do que o recibo traz',
      title: 'Recibo de pagamento',
      paid: 'Pago',
      rows: [
        { label: 'De', value: 'Estúdio Exemplo' },
        { label: 'Cobrado de', value: 'Cliente Exemplo Ltda.' },
        { label: 'Rede', value: 'Solana' },
        { label: 'Transação', value: 'a assinatura completa da transação' },
      ],
      verify: 'Mais um link e um QR code que abrem a transação em um explorador de blocos.',
    },
  },
  limits: {
    heading: 'O que faz e o que não faz',
    doesHeading: 'Faz',
    does: [
      'Cobra em USDC e USDT na Solana, com o valor exato e sem arredondar.',
      'Manda o dinheiro direto para o endereço da sua carteira. Você só informa o endereço público.',
      'Percebe o pagamento sozinho e atualiza a página do seu cliente na hora.',
      'Gera um recibo em PDF com a assinatura da transação.',
      'Mostra suas faturas abertas, pagas e vencidas e o total recebido por token, contados no seu próprio banco de dados.',
      'Mostra a página do cliente em português ou inglês, pelo idioma do navegador dele.',
    ],
    doesNotHeading: 'Não faz',
    doesNot: [
      'Não guarda dinheiro nem chaves. Não existe saldo no Quitado, nem saque.',
      'Não cobra taxa. A rede Solana cobra uma taxa pequena de quem paga, e o Quitado não recebe nada dela.',
      'Não converte para reais nem para Pix. Isso é feito por fora, em uma corretora autorizada.',
      'Não emite nota fiscal. A cotação do dólar (PTAX) e o apoio ao carnê-leão estão planejados e ainda não existem.',
      'Não soma pagamentos parciais. Pagar menos do que a fatura não a quita. Pagar mais quita, e o valor recebido fica registrado.',
      'Não impede que as empresas emissoras congelem USDC ou USDT. Isso é uma propriedade dos tokens.',
      'Não envia dados de uso a ninguém. Não há telemetria, rastreador, fonte nem script de terceiros. Ele só conversa com o provedor de RPC da Solana que você escolher.',
    ],
  },
  verify: {
    heading: 'Tudo pode ser conferido',
    intro:
      'Você não precisa acreditar na nossa palavra. Cada item abaixo é algo que você pode abrir e ler.',
    rows: [
      {
        term: 'Código aberto, Apache-2.0',
        text: 'Leia o que o servidor faz antes de confiar uma fatura a ele.',
        link: { label: 'Código-fonte', href: REPO },
      },
      {
        term: 'Todo pagamento é público',
        text: 'Uma fatura paga aponta para uma transação. Cole a assinatura em qualquer explorador da Solana e veja o valor e para onde ele foi.',
        link: { label: 'Sobre os recibos', href: `${DOCS}/receipts.md` },
      },
      {
        term: 'A detecção está documentada',
        text: 'Como um pagamento é reconhecido, e o que acontece quando ele é pequeno demais, vem em outro token ou falha.',
        link: { label: 'Detecção de pagamentos', href: `${DOCS}/payment-detection.md` },
      },
      {
        term: 'As escolhas de segurança estão escritas',
        text: 'Uma senha de acesso com limite de tentativas, proteção contra código injetado e nenhum framework web para depender. Achou uma falha? A política de segurança explica como avisar em particular.',
        link: { label: 'Notas de segurança', href: `${DOCS}/web.md` },
      },
    ],
  },
  run: {
    heading: 'Rode o seu',
    intro:
      'Não existe serviço hospedado: cada pessoa roda a própria instância, com um dono e uma carteira. Você precisa de três coisas.',
    needs: [
      'Uma carteira Solana sua. O Quitado só precisa do endereço público, nunca da frase de recuperação.',
      'Um computador ou servidor com Docker, acessível na internet por https.',
      'Um provedor de RPC da Solana, o serviço que dá ao seu servidor acesso à rede. O público e gratuito é limitado demais para uso real.',
    ],
    commandNote: 'Preencha o arquivo .env antes de iniciar. O guia explica cada configuração.',
    copy: 'Copiar',
    copied: 'Copiado',
    guide: { label: 'Ler o guia e rodar o seu', href: `${DOCS}/pt-BR/guia-rapido.md` },
  },
  faq: {
    heading: 'Perguntas',
    items: [
      {
        q: 'Preciso criar uma conta no Quitado?',
        a: 'Não. Não existe conta nem serviço hospedado. Você roda a sua própria instância, protegida por uma senha de acesso que só você conhece, e informa o endereço público da sua carteira.',
      },
      {
        q: 'O que são USDC e USDT?',
        a: 'São moedas digitais emitidas por empresas e feitas para valer um dólar americano. Elas circulam na rede Solana e ficam em carteiras como Phantom, Solflare e Backpack.',
      },
      {
        q: 'Meu cliente precisa ter carteira?',
        a: 'Sim, uma carteira Solana com saldo em USDC ou USDT, mais um pouco de SOL para a taxa da rede. Para quem nunca pagou desse jeito, a página de pagamento traz uma explicação curta.',
      },
      {
        q: 'Quanto tempo leva para a fatura aparecer como paga?',
        a: 'Em geral de 15 a 40 segundos depois do pagamento. O Quitado espera a transação ficar definitiva na blockchain, para que uma fatura paga nunca seja desfeita.',
      },
      {
        q: 'E se o cliente pagar a menos, ou a mais?',
        a: 'Pagar menos não quita a fatura, e dois pagamentos parciais não são somados. Pagar mais quita, e o valor realmente recebido fica registrado.',
      },
      {
        q: 'Posso receber em reais ou por Pix?',
        a: 'O Quitado não converte. Para transformar o dinheiro em reais, você usa uma corretora autorizada, por fora do sistema.',
      },
      {
        q: 'E o imposto?',
        a: 'O Quitado não dá aconselhamento tributário, e o recibo não é nota fiscal. Converse com o seu contador sobre como declarar o que você recebe.',
      },
      {
        q: 'Posso usar hoje com clientes de verdade?',
        a: 'O projeto está em estágio inicial e ainda não é recomendado para uso em produção. Comece com um valor pequeno, faça o teste completo com outra carteira e leia o código, que é aberto.',
      },
      {
        q: 'Quanto custa?',
        a: 'O Quitado não cobra nada. Você paga só pelo que escolher para colocá-lo no ar, como a hospedagem e o provedor de RPC. A rede Solana cobra uma taxa pequena de quem faz o pagamento.',
      },
    ],
  },
  footer: {
    meaning: '“Quitado” quer dizer pago, sem dívida.',
    license: 'Código aberto sob a licença Apache-2.0.',
    links: [
      { label: 'Código-fonte', href: REPO },
      { label: 'Guia', href: `${DOCS}/pt-BR/guia-rapido.md` },
      { label: 'Política de segurança', href: `${REPO}/blob/main/SECURITY.md` },
    ],
  },
};

const copies: Record<Lang, Copy> = { en, 'pt-BR': ptBR };

// A crisp tab icon that needs no request: a rounded square with a check mark.
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230b5fff'/%3E%3Cpath d='M9 16.5l4.5 4.5L23 11' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const external = (link: Link, className = ''): Raw =>
  html`<a class="${className}" href="${link.href}" rel="noopener">${link.label}</a>`;

function languageSwitch(lang: Lang): Raw {
  const link = (target: Lang, label: string) =>
    html`<a
      href="?lang=${target}"
      lang="${target}"
      hreflang="${target}"
      ${target === lang ? raw('aria-current="true"') : ''}
      >${label}</a
    >`;
  return html`<nav class="lang" aria-label="${t(lang, 'languageLabel')}">
    ${link('en', 'English')} ${link('pt-BR', 'Português')}
  </nav>`;
}

export function landingPage(ctx: LandingContext): string {
  const { lang, siteUrl } = ctx;
  const c = copies[lang];
  const sample = c.sample;
  const amount = `${displayAmount(1_250_000_000n, 6, lang)} USDC`;
  const due = formatDate(ctx.now + 14 * 86_400_000, ctx.utcOffsetMinutes, lang);
  const locale = lang === 'pt-BR' ? 'pt_BR' : 'en_US';

  const steps = c.how.steps.map(
    (step, index) =>
      html`<li>
        <h3>${step.title}</h3>
        <p>${step.body}</p>
        ${index === c.how.steps.length - 1 ? receipt(c, lang, amount) : ''}
      </li>`,
  );

  return html`<!doctype html>
    <html lang="${lang}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${c.htmlTitle}</title>
        <meta name="description" content="${c.description}" />
        <meta name="robots" content="index, follow" />
        <meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)" />
        <link rel="canonical" href="${siteUrl}/?lang=${lang}" />
        <link rel="alternate" hreflang="en" href="${siteUrl}/?lang=en" />
        <link rel="alternate" hreflang="pt-BR" href="${siteUrl}/?lang=pt-BR" />
        <link rel="alternate" hreflang="x-default" href="${siteUrl}/" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Quitado" />
        <meta property="og:title" content="${c.htmlTitle}" />
        <meta property="og:description" content="${c.description}" />
        <meta property="og:url" content="${siteUrl}/?lang=${lang}" />
        <meta property="og:locale" content="${locale}" />
        <link rel="icon" href="${FAVICON}" />
        <link rel="stylesheet" href="/static/app.css" />
        <link rel="stylesheet" href="/static/landing.css" />
      </head>
      <body class="landing">
        <a class="skip" href="#main">${c.skip}</a>
        <header class="site-header">
          <div class="shell">
            <a class="brand" href="/?lang=${lang}">Quitado</a>
            <div class="header-links">
              ${external({ label: c.githubLabel, href: REPO }, 'header-link')}
              ${languageSwitch(lang)}
            </div>
          </div>
        </header>

        <main id="main">
          <div class="shell lifecycle">
            <section class="hero" aria-labelledby="hero-title">
              <h1 id="hero-title">${c.hero.title}</h1>
              <p class="lead">${c.hero.lead}</p>
              <p class="promise">${c.hero.promise}</p>
              <div class="actions">
                ${external(c.hero.guide, 'button button-lg')}
                ${external(c.hero.code, 'button button-lg secondary')}
              </div>
              <p class="banner early">${c.hero.early}</p>
              <p class="muted tokens">${c.hero.tokens}</p>
            </section>

            <div class="sample-wrap">
              <figure class="sample" role="img" aria-label="${sample.ariaLabel}">
                <div aria-hidden="true">
                  <div class="sample-head">
                    <span class="label">${sample.caption}</span>
                    <span class="chips">
                      <span class="chip chip-open">${t(lang, 'statusOpen')}</span>
                      <span class="chip chip-paid">${t(lang, 'statusPaid')}</span>
                    </span>
                  </div>
                  <p class="sample-amount">${amount}</p>
                  <dl class="facts">
                    <div>
                      <dt class="label">${sample.from}</dt>
                      <dd>${sample.fromValue}</dd>
                    </div>
                    <div>
                      <dt class="label">${sample.billedTo}</dt>
                      <dd>${sample.billedToValue}</dd>
                    </div>
                    <div>
                      <dt class="label">${sample.description}</dt>
                      <dd>${sample.descriptionValue}</dd>
                    </div>
                    <div>
                      <dt class="label">${sample.due}</dt>
                      <dd>${due}</dd>
                    </div>
                    <div>
                      <dt class="label">${sample.network}</dt>
                      <dd>${sample.networkValue}</dd>
                    </div>
                    <div class="wide">
                      <dt class="label">${sample.recipient}</dt>
                      <dd>${sample.recipientValue}</dd>
                    </div>
                  </dl>
                  <ol class="events">
                    ${sample.events.map((event) => html`<li>${event}</li>`)}
                  </ol>
                </div>
              </figure>
            </div>

            <section class="steps-section" id="how" aria-labelledby="how-title">
              <h2 id="how-title">${c.how.heading}</h2>
              <ol class="steps">
                ${steps}
              </ol>
            </section>
          </div>

          <div class="shell">
            <section class="section" id="limits" aria-labelledby="limits-title">
              <h2 id="limits-title">${c.limits.heading}</h2>
              <div class="cols">
                <div>
                  <h3>${c.limits.doesHeading}</h3>
                  <ul class="marks marks-does">
                    ${c.limits.does.map((item) => html`<li>${item}</li>`)}
                  </ul>
                </div>
                <div>
                  <h3>${c.limits.doesNotHeading}</h3>
                  <ul class="marks marks-not">
                    ${c.limits.doesNot.map((item) => html`<li>${item}</li>`)}
                  </ul>
                </div>
              </div>
            </section>

            <section class="section" id="verify" aria-labelledby="verify-title">
              <h2 id="verify-title">${c.verify.heading}</h2>
              <p class="intro">${c.verify.intro}</p>
              <dl class="ledger">
                ${c.verify.rows.map(
                  (row) =>
                    html`<div>
                      <dt>${row.term}</dt>
                      <dd>
                        <p>${row.text}</p>
                        ${external(row.link)}
                      </dd>
                    </div>`,
                )}
              </dl>
            </section>

            <section class="section" id="run" aria-labelledby="run-title">
              <h2 id="run-title">${c.run.heading}</h2>
              <p class="intro">${c.run.intro}</p>
              <div class="run">
                <ul class="marks marks-does needs">
                  ${c.run.needs.map((item) => html`<li>${item}</li>`)}
                </ul>
                <div class="command">
                  <pre class="mono" tabindex="0"><code>${COMMAND}</code></pre>
                  <p class="muted">${c.run.commandNote}</p>
                  <button
                    type="button"
                    class="secondary"
                    data-copy="${COMMAND}"
                    data-copied="${c.run.copied}"
                  >
                    ${c.run.copy}
                  </button>
                </div>
              </div>
              <p class="run-action">${external(c.run.guide, 'button button-lg')}</p>
            </section>

            <section class="section faq" id="faq" aria-labelledby="faq-title">
              <h2 id="faq-title">${c.faq.heading}</h2>
              ${c.faq.items.map(
                (item) =>
                  html`<details>
                    <summary>${item.q}</summary>
                    <p>${item.a}</p>
                  </details>`,
              )}
            </section>
          </div>
        </main>

        <footer class="site-footer">
          <div class="shell">
            <p>${c.footer.meaning} ${c.footer.license}</p>
            <nav class="footer-links" aria-label="Quitado">
              ${c.footer.links.map((link) => external(link))}
            </nav>
          </div>
        </footer>
        <script src="/static/app.js" defer></script>
      </body>
    </html>`.value;
}

function receipt(c: Copy, lang: Lang, amount: string): Raw {
  const r = c.how.receipt;
  return html`<figure class="receipt" lang="${lang}">
    <figcaption class="label">${r.caption}</figcaption>
    <div class="receipt-head">
      <p class="receipt-title">${r.title}</p>
      <span class="chip chip-paid">${r.paid}</span>
    </div>
    <p class="receipt-amount">${amount}</p>
    <dl class="facts">
      ${r.rows.map(
        (row) =>
          html`<div>
            <dt class="label">${row.label}</dt>
            <dd>${row.value}</dd>
          </div>`,
      )}
    </dl>
    <p class="muted">${r.verify}</p>
  </figure>`;
}
