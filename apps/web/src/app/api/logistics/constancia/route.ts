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
      executablePath: process.env.NODE_ENV === "production" ? "/usr/bin/chromium-browser" : undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    // 1. Navegar a login
    console.log("Navegando a login...");
    await page.goto(`${EPRESIS_BASE}/login`, {
      waitUntil: "networkidle2",
    });

    // 2. Completar formulario de login - intentar múltiples selectores
    console.log("Ingresando credenciales...");

    // Investigar inputs disponibles
    const inputs = await page.$$('input');
    console.log(`Encontrados ${inputs.length} inputs`);
    for (let i = 0; i < inputs.length; i++) {
      const type = await page.$eval(`input:nth-child(${i+1})`, (el: any) => el.type || el.name || el.placeholder || 'unknown');
      console.log(`Input ${i}: ${type}`);
    }

    try {
      await page.type('input[type="email"]', EPRESIS_USER);
      console.log("Email ingresado con input[type='email']");
    } catch (e1) {
      console.log("Email selector email no funcionó:", (e1 as any).message);
      try {
        await page.type('input[name="email"]', EPRESIS_USER);
        console.log("Email ingresado con input[name='email']");
      } catch (e2) {
        console.log("Email selector name no funcionó:", (e2 as any).message);
        try {
          const inputs = await page.$$('input');
          if (inputs.length > 0) {
            await inputs[0].type(EPRESIS_USER);
            console.log("Email ingresado con primer input");
          }
        } catch (e3) {
          console.log("Error ingresando email:", (e3 as any).message);
        }
      }
    }

    try {
      await page.type('input[type="password"]', EPRESIS_PASS);
      console.log("Password ingresado con input[type='password']");
    } catch (e1) {
      console.log("Password selector password no funcionó:", (e1 as any).message);
      try {
        await page.type('input[name="password"]', EPRESIS_PASS);
        console.log("Password ingresado con input[name='password']");
      } catch (e2) {
        console.log("Password selector name no funcionó:", (e2 as any).message);
        try {
          const inputs = await page.$$('input');
          if (inputs.length > 1) {
            await inputs[1].type(EPRESIS_PASS);
            console.log("Password ingresado con segundo input");
          }
        } catch (e3) {
          console.log("Error ingresando password:", (e3 as any).message);
        }
      }
    }

    // 3. Enviar formulario - intentar múltiples selectores
    console.log("Enviando formulario...");

    // Investigar botones disponibles
    const buttons = await page.$$('button');
    console.log(`Encontrados ${buttons.length} botones`);
    for (let i = 0; i < buttons.length; i++) {
      const text = await page.$eval(`button:nth-child(${i+1})`, (el: any) => el.textContent || el.innerHTML || 'empty');
      console.log(`Button ${i}: ${text.substring(0, 50)}`);
    }

    let submitted = false;
    const clickAttempts = [
      'button[type="submit"]',
      'form button',
      'button',
    ];

    for (const selector of clickAttempts) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          console.log(`Intentando hacer click con selector: ${selector}`);
          await Promise.race([
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }),
            page.click(selector),
          ]);
          submitted = true;
          console.log("✓ Formulario enviado con selector:", selector);
          break;
        }
      } catch (e) {
        console.log("✗ Selector no funcionó:", selector, (e as any).message);
      }
    }

    if (!submitted) {
      console.warn("No se pudo hacer click en botón, intentando presionar Enter...");
      await page.keyboard.press("Enter");
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {
        console.log("Navigation timeout después de Enter (esperado)");
      });
    }

    // Tomar screenshot después del login para debugging
    console.log("Tomando screenshot después del login...");
    const loginScreenshot = await page.screenshot({ encoding: 'base64' });
    console.log("Screenshot después login (primeros 100 chars):", loginScreenshot.substring(0, 100));

    // Esperar a que la página se estabilice después del login
    await page.waitForTimeout(2000);

    // 4. Navegar a constancia
    console.log("Navegando a constancia...");
    const constanciaUrl = `${EPRESIS_BASE}/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}`;
    console.log("URL:", constanciaUrl);

    try {
      await page.goto(constanciaUrl, {
        waitUntil: "networkidle2",
      });
      console.log("✓ Página de constancia cargada");
    } catch (e) {
      console.log("⚠ Error navegando (continuando):", (e as any).message);
    }

    // Tomar screenshot de la página de constancia
    console.log("Tomando screenshot de constancia...");
    const constanciaScreenshot = await page.screenshot({ encoding: 'base64' });
    console.log("Screenshot constancia (primeros 100 chars):", constanciaScreenshot.substring(0, 100));

    // Revisar content type
    const content = await page.content();
    console.log("Contenido página (primeros 200 chars):", content.substring(0, 200));

    // Esperar a que el contenido se cargue
    await page.waitForTimeout(1000);

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
      try {
        await browser.close();
      } catch (e) {
        console.error("Error cerrando browser:", e);
      }
    }
  }
}
