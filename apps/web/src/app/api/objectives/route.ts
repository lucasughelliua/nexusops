import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createObjectiveSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(2).max(200),
  description: z.string().max(500).optional(),
  metric: z.string().min(1),
  targetValue: z.number().min(0),
  period: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

/**
 * GET /api/objectives
 * Obtener todos los objetivos del usuario
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const objectives = await prisma.objective.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ objectives }, { status: 200 });
  } catch (error) {
    console.error("Error fetching objectives:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/objectives
 * Crear nuevo objetivo
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validar datos
    const validatedData = createObjectiveSchema.safeParse({
      ...body,
      startDate: new Date(body.startDate).toISOString(),
      endDate: new Date(body.endDate).toISOString(),
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

    const {
      accountId,
      name,
      description,
      metric,
      targetValue,
      period,
      startDate,
      endDate,
    } = validatedData.data;

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

    // Crear objetivo
    const objective = await prisma.objective.create({
      data: {
        accountId,
        userId: session.user.id,
        name,
        description,
        metric,
        targetValue,
        period,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE_OBJECTIVE",
        resource: "Objective",
        resourceId: objective.id,
        details: {
          name,
          metric,
          targetValue,
        },
      },
    });

    return NextResponse.json(
      {
        message: "Objective created successfully",
        objective,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating objective:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
