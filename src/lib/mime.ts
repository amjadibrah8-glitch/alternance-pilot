/**
 * Construction d'un e-mail RFC 2822 (texte + pièce jointe PDF optionnelle)
 * encodé en base64url, format attendu par Gmail `users.messages.send`.
 */
export type MimeInput = {
  from: string;
  to: string;
  subject: string;
  text: string;
  attachment?: { filename: string; contentType: string; data: Buffer };
  messageId?: string;
};

function encodeHeader(value: string): string {
  // Encodage RFC 2047 si caractères non ASCII (accents dans l'objet, par ex.).
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd();
}

export function buildMime(input: MimeInput): string {
  const boundary = `ap_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    ...(input.messageId ? [`Message-ID: ${input.messageId}`] : []),
  ];
  const textPart = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(input.text, "utf8").toString("base64")),
  ].join("\r\n");

  let raw: string;
  if (!input.attachment) {
    raw = [...headers, textPart].join("\r\n");
  } else {
    const a = input.attachment;
    raw = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      textPart,
      `--${boundary}`,
      `Content-Type: ${a.contentType}; name="${encodeHeader(a.filename)}"`,
      `Content-Disposition: attachment; filename="${encodeHeader(a.filename)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(a.data.toString("base64")),
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }
  return Buffer.from(raw, "utf8").toString("base64url");
}
