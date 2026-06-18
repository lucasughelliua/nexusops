import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios, { AxiosInstance } from "axios";
import * as http from "http";
import * as https from "https";

/**
 * GET /api/logistics/constancia?guiaAgente=...
 * Descarga la constancia electrónica de Epresis.
 * Usa credenciales preconfiguradas para login automático.
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

  try {
    // 1. Intentar login en Epresis
    // Probar con form-urlencoded
    const loginParams = new URLSearchParams({
      email: EPRESIS_USER,
      password: EPRESIS_PASS,
    });

    console.log("Attempting login to Epresis with user:", EPRESIS_USER);

    const loginRes = await fetch(`${EPRESIS_BASE}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": EPRESIS_BASE,
        "Origin": EPRESIS_BASE,
      },
      body: loginParams.toString(),
      redirect: "manual",
    });

    console.log("Login status:", loginRes.status);
    console.log("Login response headers:", Array.from(loginRes.headers.keys()));

    // Extraer todas las cookies (puede haber múltiples Set-Cookie headers)
    const cookies: string[] = [];
    loginRes.headers.forEach((value, name) => {
      if (name.toLowerCase() === "set-cookie") {
        const cookieOnly = value.split(";")[0];
        console.log("Cookie found:", cookieOnly);
        cookies.push(cookieOnly);
      }
    });

    const cookieString = cookies.join("; ");
    console.log("Cookies for constancia:", cookieString || "NONE");

    // 2. Intentar descargar constancia directamente SIN login (fallback)
    // Algunos sitios permiten acceso público a PDFs
    const constanciaRes = await fetch(
      `${EPRESIS_BASE}/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}`,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": `${EPRESIS_BASE}/login`,
          ...(cookieString ? { "Cookie": cookieString } : {}),
        },
      }
    );

    console.log("Constancia status:", constanciaRes.status);
    console.log("Constancia response type:", constanciaRes.headers.get("content-type"));

    if (!constanciaRes.ok) {
      const text = await constanciaRes.text();
      console.log("Constancia error response status:", constanciaRes.status);
      console.log("Constancia error response body:", text.slice(0, 500));

      // Si es 302/redirect, puede requerir login
      if (constanciaRes.status === 302 || constanciaRes.status === 401) {
        return NextResponse.json(
          { error: "Constancia requiere autenticación. Abre el enlace manualmente.", loginRequired: true, url: `${EPRESIS_BASE}/guias/remito/imprimir-guia?url=constancia_electronica&guia_id=${encodeURIComponent(guiaAgente)}` },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: "No se pudo descargar la constancia", status: constanciaRes.status, body: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const buffer = await constanciaRes.arrayBuffer();
    const bufferData = Buffer.from(buffer);

    // Verificar si es PDF
    const isPdf = bufferData.slice(0, 4).toString() === "%PDF";
    console.log("Is PDF:", isPdf, "Size:", bufferData.length, "First bytes:", bufferData.slice(0, 10).toString());

    if (!isPdf) {
      console.warn("Response is not PDF. First 200 bytes:", bufferData.slice(0, 200).toString());
      return NextResponse.json(
        { error: "La respuesta no es un PDF válido", preview: bufferData.slice(0, 200).toString() },
        { status: 502 }
      );
    }

    return new NextResponse(bufferData, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="constancia_${guiaAgente}.pdf"`,
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
  }
}
