// Bilingual transactional order emails, sent through Resend (DEC-25).
// Kinds: welcome (payment confirmed), shipped, canceled.

const REPLY_TO = 'hello@tali.my';

const statusLink = (locale, sessionId) =>
  `https://tali.my${locale === 'es' ? '/es' : ''}/thanks/?session_id=${encodeURIComponent(sessionId)}`;

const COPY = {
  welcome: {
    en: {
      subject: 'Your Tali order is confirmed',
      body: (o) => `Thank you for your Founder Edition pre-order. We've received your payment and your order is now being prepared.`,
      cta: 'View your order status',
      outro: `We'll email you again the moment it ships.`,
    },
    es: {
      subject: 'Tu pedido Tali está confirmado',
      body: (o) => `Gracias por tu pre-orden de la Edición Founder. Recibimos tu pago y tu pedido ya está en preparación.`,
      cta: 'Ver el estado de tu pedido',
      outro: `Te escribiremos de nuevo en cuanto lo enviemos.`,
    },
  },
  shipped: {
    en: {
      subject: 'Your Tali order is on its way',
      body: (o) => `Good news — your Founder Edition has shipped.`,
      cta: 'View your order status',
      outro: `Thank you for being a founder.`,
    },
    es: {
      subject: 'Tu pedido Tali va en camino',
      body: (o) => `Buenas noticias — tu Edición Founder ya fue enviada.`,
      cta: 'Ver el estado de tu pedido',
      outro: `Gracias por ser founder.`,
    },
  },
  canceled: {
    en: {
      subject: 'About your Tali order',
      body: (o) => `Your order has been canceled. If you have any questions, or believe this is an error, write to us at ${REPLY_TO} and we'll sort it out.`,
      cta: '',
      outro: '',
    },
    es: {
      subject: 'Sobre tu pedido Tali',
      body: (o) => `Tu pedido fue cancelado. Si tienes preguntas, o crees que se trata de un error, escríbenos a ${REPLY_TO} y lo resolvemos.`,
      cta: '',
      outro: '',
    },
  },
};

const btn = (href, label) =>
  `<a href="${href}" style="display:inline-block;background:#2e7573;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 22px;font-weight:600;">${label}</a>`;

function render(kind, order) {
  const t = COPY[kind][order.locale === 'es' ? 'es' : 'en'];
  const es = order.locale === 'es';
  const link = statusLink(order.locale, order.sessionId);
  const hi = es ? 'Hola' : 'Hi';
  const trackLabel = es ? 'Rastrear tu envío' : 'Track your shipment';
  const parts = [
    `<p style="margin:0 0 16px;">${hi} ${order.name || ''},</p>`,
    `<p style="margin:0 0 20px;">${t.body(order)}</p>`,
  ];
  if (kind === 'shipped' && order.tracking) {
    parts.push(`<p style="margin:0 0 20px;">${btn(order.tracking, trackLabel)}</p>`);
  }
  if (t.cta && order.sessionId) {
    parts.push(`<p style="margin:0 0 20px;">${btn(link, t.cta)}</p>`);
  }
  if (t.outro) parts.push(`<p style="margin:0 0 16px;">${t.outro}</p>`);
  parts.push(`<p style="margin:24px 0 0;color:#8a8378;font-size:13px;">Tali — tali.my</p>`);
  return {
    subject: t.subject,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.55;color:#2b2620;max-width:520px;margin:0 auto;padding:24px;">${parts.join('')}</div>`,
  };
}

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
