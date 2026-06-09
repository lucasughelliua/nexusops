import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createAccountSchema } from "@/lib/validators/account";

/**
 * GET /api/accounts
 * Obtener todas las cuentas del usuario
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Obtener cuentas con datos relacionados
    const accounts = await prisma.account.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        credentials: {
          select: {
            id: true,
            platform: true,
            name: true,
            syncStatus: true,
            lastSyncAt: true,
          },
        },
        metrics: {
          select: {
            metricType: true,
          },
          distinct: ["metricType"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Agregar información adicional
    const enriched = accounts.map((account) => ({
      ...account,
      credentialsCount: account.credentials.length,
      metricsCount: account.metrics.length,
      platforms: account.credentials.map((c) => c.platform),
    }));

    return NextResponse.json({ accounts: enriched }, { status: 200 });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounts
 * Crear nueva cuenta
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validar datos
    const validatedData = createAccountSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        {
          message: "Validation failed",
          errors: validatedData.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, description } = validatedData.data;

    // Verificar que no existe otra cuenta con el mismo nombre
    const existing = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        name,
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "Account with this name already exists" },
        { status: 409 }
      );
    }

    // Crear cuenta
    const account = await prisma.account.create({
      data: {
        name,
        description,
        userId: session.user.id,
      },
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE_ACCOUNT",
        resource: "Account",
        resourceId: account.id,
        details: {
          name,
          description,
        },
      },
    });

    return NextResponse.json(
      {
        message: "Account created successfully",
        account,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
