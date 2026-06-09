import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { credentialSchema } from "@/lib/validators/account";

/**
 * GET /api/credentials
 * Obtener todas las credenciales del usuario
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Obtener credenciales (sin valores encriptados)
    const credentials = await prisma.credential.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        accountId: true,
        platform: true,
        type: true,
        name: true,
        expiresAt: true,
        lastSyncAt: true,
        syncStatus: true,
        syncError: true,
        createdAt: true,
        updatedAt: true,
        // NO incluir 'value'
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ credentials }, { status: 200 });
  } catch (error) {
    console.error("Error fetching credentials:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/credentials
 * Crear nueva credencial
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validar datos
    const validatedData = credentialSchema.safeParse({
      ...body,
      // Convertir string dates a Date objects si es necesario
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    if (!validatedData.success) {
      return NextResponse.json(
        {
          message: "Validation failed",
          errors: validatedData.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { accountId, platform, type, name, value, expiresAt } =
      validatedData.data;

    // Verificar que la cuenta existe y pertenece al usuario
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        userId: session.user.id,
      },
    });

    if (!account) {
      return NextResponse.json(
        { message: "Account not found or unauthorized" },
        { status: 404 }
      );
    }

    // Verificar que no existe otra credencial con el mismo nombre y plataforma
    const existing = await prisma.credential.findFirst({
      where: {
        accountId,
        platform,
        name,
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          message: "Credential with this name already exists for this platform",
        },
        { status: 409 }
      );
    }

    // Encriptar valor
    const encryptedValue = encrypt(value);

    // Crear credencial
    const credential = await prisma.credential.create({
      data: {
        accountId,
        userId: session.user.id,
        platform,
        type,
        name,
        value: encryptedValue,
        expiresAt,
        syncStatus: "PENDING",
      },
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE_CREDENTIAL",
        resource: "Credential",
        resourceId: credential.id,
        details: {
          platform,
          type,
          name,
        },
      },
    });

    return NextResponse.json(
      {
        message: "Credential created successfully",
        credential: {
          id: credential.id,
          accountId: credential.accountId,
          platform: credential.platform,
          type: credential.type,
          name: credential.name,
          createdAt: credential.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating credential:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
