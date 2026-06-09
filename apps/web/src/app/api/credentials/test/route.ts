import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { createIntegrationClient } from "@/lib/integrations";
import { z } from "zod";

const testSchema = z.object({
  credentialId: z.string().min(1),
});

/**
 * POST /api/credentials/test
 * Probar conexión de una credencial
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validar datos
    const validatedData = testSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        {
          message: "Validation failed",
          errors: validatedData.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { credentialId } = validatedData.data;

    // Obtener credencial
    const credential = await prisma.credential.findFirst({
      where: {
        id: credentialId,
        userId: session.user.id,
      },
    });

    if (!credential) {
      return NextResponse.json(
        { message: "Credential not found" },
        { status: 404 }
      );
    }

    // Desencriptar valor
    let decryptedValue: any;
    try {
      decryptedValue = decrypt(credential.value);
      // Parsear como JSON si es necesario
      try {
        decryptedValue = JSON.parse(decryptedValue);
      } catch {
        // Si no es JSON, usar el string directo
      }
    } catch (error) {
      return NextResponse.json(
        { message: "Failed to decrypt credential" },
        { status: 500 }
      );
    }

    // Crear cliente de integración
    const client = createIntegrationClient(credential.platform, decryptedValue);

    // Probar conexión
    const isValid = await client.testConnection();

    if (!isValid) {
      // Actualizar estado de sincronización
      await prisma.credential.update({
        where: { id: credentialId },
        data: {
          syncStatus: "ERROR",
          syncError: "Connection test failed",
        },
      });

      return NextResponse.json(
        { message: "Connection test failed", success: false },
        { status: 400 }
      );
    }

    // Actualizar estado de sincronización
    await prisma.credential.update({
      where: { id: credentialId },
      data: {
        syncStatus: "SUCCESS",
        syncError: null,
        lastSyncAt: new Date(),
      },
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "TEST_CREDENTIAL",
        resource: "Credential",
        resourceId: credentialId,
      },
    });

    return NextResponse.json(
      { message: "Connection successful", success: true },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error testing credential:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
