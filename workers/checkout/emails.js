// Bilingual transactional order emails, sent through Resend (DEC-25).
// Kinds: welcome (payment confirmed), shipped, canceled.
// Table-based HTML with inline styles (Gmail/Outlook-safe); colors mirror
// the site's :root tokens in src/styles/global.css — keep them in sync on
// a rebrand (DEC-8).

const REPLY_TO = 'hello@tali.my';

const C = {
  bg: '#f7f3ec',
  surface: '#fffdf9',
  surface2: '#f0e9dc',
  line: '#e3dccc',
  text: '#262019',
  dim: '#7a6f5d',
  accent: '#2e7573',
  onAccent: '#f4faf9',
};
// The site's real fonts, self-hosted at stable URLs (public/fonts/) for the
// email clients that load web fonts (Apple Mail, iOS…); the stacks fall back
// to Georgia/system fonts everywhere else (Gmail strips @font-face).
const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', 'Courier New', Courier, monospace";
const FONT_CSS = `@font-face{font-family:'Fraunces';font-style:normal;font-weight:100 900;src:url('https://tali.my/fonts/fraunces.woff2') format('woff2');}
@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;src:url('https://tali.my/fonts/inter.woff2') format('woff2');}
@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:400;src:url('https://tali.my/fonts/ibm-plex-mono.woff2') format('woff2');}`;

const statusLink = (locale, sessionId) =>
  `https://tali.my${locale === 'es' ? '/es' : ''}/thanks/?session_id=${encodeURIComponent(sessionId)}`;

const COPY = {
  welcome: {
    en: {
      kicker: 'Order confirmed',
      title: (o) => `Thank you${o.name ? `, ${o.name.split(' ')[0]}` : ''}.`,
      preheader: 'Your Founder Edition pre-order is confirmed.',
      body: `We've received your payment and your Founder Edition is now being prepared. You can follow your order anytime — the button below always shows its latest status.`,
      item: 'Tali Founders Edition + Puk',
      cta: 'View your order status',
      outro: `We'll email you again the moment it ships.`,
    },
    es: {
      kicker: 'Pedido confirmado',
      title: (o) => `Gracias${o.name ? `, ${o.name.split(' ')[0]}` : ''}.`,
      preheader: 'Tu pre-orden de la Edición Founder está confirmada.',
      body: `Recibimos tu pago y tu Edición Founder ya está en preparación. Puedes seguir tu pedido cuando quieras — el botón de abajo siempre muestra su estado más reciente.`,
      item: 'Tali Edición Founders + Puk',
      cta: 'Ver el estado de tu pedido',
      outro: `Te escribiremos de nuevo en cuanto lo enviemos.`,
    },
  },
  shipped: {
    en: {
      kicker: 'On its way',
      title: () => `Your Tali has shipped.`,
      preheader: 'Your Founder Edition is on its way.',
      body: `Good news — your Founder Edition just left our hands and is on its way to you.`,
      cta: 'Track your shipment',
      cta2: 'View your order status',
      outro: `Thank you for being a founder.`,
    },
    es: {
      kicker: 'En camino',
      title: () => `Tu Tali ya fue enviado.`,
      preheader: 'Tu Edición Founder va en camino.',
      body: `Buenas noticias — tu Edición Founder acaba de salir y va en camino hacia ti.`,
      cta: 'Rastrear tu envío',
      cta2: 'Ver el estado de tu pedido',
      outro: `Gracias por ser founder.`,
    },
  },
  canceled: {
    en: {
      kicker: 'Order canceled',
      title: () => `About your order.`,
      preheader: 'Your Tali order has been canceled.',
      body: `Your order has been canceled. If you have any questions, or believe this is an error, just reply to this email — or write to ${REPLY_TO} — and we'll sort it out.`,
      outro: '',
    },
    es: {
      kicker: 'Pedido cancelado',
      title: () => `Sobre tu pedido.`,
      preheader: 'Tu pedido Tali fue cancelado.',
      body: `Tu pedido fue cancelado. Si tienes preguntas, o crees que se trata de un error, responde a este correo — o escríbenos a ${REPLY_TO} — y lo resolvemos.`,
      outro: '',
    },
  },
};

const TAGLINE = {
  en: 'Precision environmental monitoring for collections that matter.',
  es: 'Monitor ambiental de precisión para colecciones que importan.',
};

const button = (href, label, primary) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr><td style="border-radius:10px;background:${primary ? C.accent : C.surface};border:1px solid ${primary ? C.accent : C.line};">
  <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:600;color:${primary ? C.onAccent : C.accent};text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr></table>`;

function render(kind, order) {
  const locale = order.locale === 'es' ? 'es' : 'en';
  const t = COPY[kind][locale];
  const link = statusLink(locale, order.sessionId);

  const blocks = [
    `<p style="margin:0 0 10px;font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.accent};">${t.kicker}</p>`,
    `<h1 style="margin:0 0 18px;font-family:${SERIF};font-size:28px;line-height:1.2;font-weight:600;color:${C.text};">${t.title(order)}</h1>`,
    `<p style="margin:0 0 22px;font-family:${SANS};font-size:15px;line-height:1.65;color:${C.text};">${t.body}</p>`,
  ];

  if (kind === 'welcome' && order.amount) {
    blocks.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${C.surface2};border-radius:10px;"><tr>
      <td style="padding:14px 18px;font-family:${SANS};font-size:14px;color:${C.text};">${t.item}</td>
      <td align="right" style="padding:14px 18px;font-family:${MONO};font-size:14px;color:${C.text};white-space:nowrap;">${order.amount}</td>
      </tr></table>`
    );
  }

  if (kind === 'welcome') {
    blocks.push(button(link, t.cta, true));
  } else if (kind === 'shipped') {
    if (order.tracking) {
      blocks.push(button(order.tracking, t.cta, true));
      blocks.push(button(link, t.cta2, false));
    } else {
      blocks.push(button(link, t.cta2, true));
    }
  }

  if (t.outro) {
    blocks.push(
      `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${C.line};font-family:${SANS};font-size:14px;line-height:1.6;color:${C.dim};">${t.outro}</p>`
    );
  }

  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><style>${FONT_CSS}</style></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${t.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:36px 16px 44px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;">
    <tr><td style="padding:0 6px 20px;">
      <a href="https://tali.my" style="text-decoration:none;"><img src="https://tali.my/images/tali-logo.png" alt="Tali" height="26" style="height:26px;border:0;"></a>
    </td></tr>
    <tr><td style="background:${C.surface};border:1px solid ${C.line};border-radius:14px;padding:34px 34px 30px;">
      ${blocks.join('')}
    </td></tr>
    <tr><td style="padding:22px 6px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.dim};">
      ${TAGLINE[locale]}<br>
      <a href="https://tali.my" style="color:${C.accent};text-decoration:none;">tali.my</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return { subject: SUBJECTS[kind][locale], html };
}

const SUBJECTS = {
  welcome: { en: 'Your Tali order is confirmed', es: 'Tu pedido Tali está confirmado' },
  shipped: { en: 'Your Tali order is on its way', es: 'Tu pedido Tali va en camino' },
  canceled: { en: 'About your Tali order', es: 'Sobre tu pedido Tali' },
};

/** Send one of the order emails. Throws on failure so callers can react. */
export async function sendOrderEmail(env, kind, order) {
  const { subject, html } = render(kind, order);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'Tali <orders@tali.my>',
      to: [order.email],
      reply_to: REPLY_TO,
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
