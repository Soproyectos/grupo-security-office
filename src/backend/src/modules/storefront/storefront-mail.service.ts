import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class StorefrontMailService {
  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.config.get("SMTP_HOST"));
  }

  async send(
    to: string,
    subject: string,
    text: string,
    sender?: { name: string; address: string },
  ) {
    if (!this.configured)
      throw new ServiceUnavailableException(
        "El envío de correos aún no está configurado. Contacta al equipo comercial.",
      );
    const transport = nodemailer.createTransport({
      host: this.config.get<string>("SMTP_HOST"),
      port: Number(this.config.get("SMTP_PORT") ?? 587),
      secure: this.config.get("SMTP_SECURE") === "true",
      auth: this.config.get("SMTP_USER")
        ? {
            user: this.config.get("SMTP_USER"),
            pass: this.config.get("SMTP_PASSWORD"),
          }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    const address = sender?.address || this.config.get<string>("SMTP_FROM");
    if (!address)
      throw new ServiceUnavailableException(
        "Configura el remitente de los correos de la tienda.",
      );
    try {
      await transport.sendMail({
        from: { name: sender?.name || "Grupo Security", address },
        to,
        subject,
        text,
      });
    } catch {
      throw new ServiceUnavailableException(
        "No fue posible enviar el correo. Puedes intentarlo de nuevo o contactar al equipo comercial.",
      );
    } finally {
      transport.close();
    }
  }
}
