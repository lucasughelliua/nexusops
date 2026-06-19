import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import puppeteer from "puppeteer";

/**
 * GET /api/logistics/constancia?guiaAgente=...
 * Descarga la constancia electrónica de Epresis usando Puppeteer.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const guiaAgente = request.nextUrl.searchParams.get("guiaAgente")?.trim();
  if (!guiaAgente) {
    return NextResponse.json(
      { error: "Se requiere guiaAgente para generar la constancia" },
      { status: 400 }
    );
  }

  const EPRESIS_USER = process.env.EPRESIS_USER;
  const EPRESIS_PASS = process.env.EPRESIS_PASS;

  if (!EPRESIS_USER || !EPRESIS_PASS) {
    return NextResponse.json(
      { error: "Credenciales de Epresis no configuradas en el servidor" },
      { status: 500 }
    );
  }

  const EPRESIS_BASE = "https://epresis.seguimientodeenvios.ar";
  let browser: any;

  try {
    console.log("=== CONSTANCIA PUPPETEER ===");
    console.log("guiaAgente:", guiaAgente);

    // Lanzar navegador
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();

    // 1. Navegar a login
    console.log("Navegando a login...");
    await page.goto(`${EPRESIS_BASE}/login`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // 2. Completar formulario de login
    console.log("Ingresando credenciales...");
    await page.type('input[type="email"], input[name="email"], input[placeholder*="email" i]', EPRESIS_USER);
    await page.type('input[type="password"], input[name="password"], input[placeholder*="password" i]', EPRESIS_PASS);

    // 3. Enviar formulario
    console.log("Enviando formulario...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
      page.click('button[type="submit"], button:contains("Ingresar"), button:contains("Login")'),
    ]).catch(() => console.log("Navigation timeout (puede ser normal)"));

    // 4. Navegar a constancia
    console.log("Navegando a constancia...");
    const constanciaUrl = `${EPRESIS_BASE}/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}`;
    await page.goto(constanciaUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // 5. Generar PDF
    console.log("Generando PDF...");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    console.log("PDF generado, size:", pdfBuffer.length);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="constancia_${guiaAgente}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Error descargando constancia:", err.message);
    console.error("Stack:", err.stack);
    return NextResponse.json(
      { error: "No se pudo descargar la constancia", detail: err?.message },
      { status: 502 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
