import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import puppeteer from "puppeteer-core";

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
    console.log("=== CONSTANCIA PUPPETEER START ===");
    console.log("guiaAgente:", guiaAgente);

    // Lanzar navegador
    console.log("Lanzando Chromium...");
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("executablePath será:", process.env.NODE_ENV === "production" ? "/usr/bin/chromium-browser" : "auto");

    const launchConfig: any = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    };

    // Forzar ruta de Chromium en producción
    if (process.env.NODE_ENV === "production") {
      launchConfig.executablePath = "/usr/bin/chromium-browser";
    }

    console.log("Launch config:", JSON.stringify(launchConfig));

    browser = await puppeteer.launch(launchConfig);
    console.log("✓ Chromium lanzado");

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    console.log("✓ Página creada");

    // 1. Navegar a login
    console.log("Navegando a login...");
    await page.goto(`${EPRESIS_BASE}/login`, {
      waitUntil: "networkidle2",
    });
    console.log("✓ Login cargado");

    // 2. Rellenar credenciales
    console.log("Rellenando credenciales...");
    await page.focus('input:first-of-type');
    await page.keyboard.type(EPRESIS_USER);
    console.log("✓ Email ingresado");

    await page.focus('input:nth-of-type(2)');
    await page.keyboard.type(EPRESIS_PASS);
    console.log("✓ Password ingresado");

    // 3. Enviar formulario
    console.log("Enviando formulario...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]).catch((e) => console.log("Navigation timeout (normal):", e.message));

    await page.waitForTimeout(1500);
    console.log("✓ Login completado");

    // 4. Navegar a constancia
    console.log("Navegando a constancia...");
    const constanciaUrl = `${EPRESIS_BASE}/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}`;
    console.log("URL constancia:", constanciaUrl);

    await page.goto(constanciaUrl, {
      waitUntil: "networkidle2",
    });
    console.log("✓ Página constancia cargada");

    await page.waitForTimeout(1500);

    // 5. Generar PDF
    console.log("Generando PDF...");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    console.log("✓ PDF generado, tamaño:", pdfBuffer.length, "bytes");

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="constancia_${guiaAgente}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("✗ ERROR:", err.message);
    console.error("Stack:", err.stack);
    return NextResponse.json(
      { error: "No se pudo descargar la constancia", detail: err?.message },
      { status: 502 }
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log("✓ Browser cerrado");
      } catch (e) {
        console.error("Error cerrando browser:", e);
      }
    }
    console.log("=== CONSTANCIA PUPPETEER END ===");
  }
}
