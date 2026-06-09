import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateAccountSchema } from "@/lib/validators/account";

type RouteParams = {
  params: {
    id: string;
  };
};

/**
 * GET /api/accounts/[id]
 * Obtener una cuenta específica
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    // Obtener cuenta
    const account = await prisma.account.findFirst({
      where: {
        id,
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
            syncError: true,
          },
        },
        objectives: {
          select: {
            id: true,
            name: true,
            metric: true,
            targetValue: true,
            status: true,
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { message: "Account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ account }, { status: 200 });
  } catch (error) {
    console.error("Error fetching account:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/accounts/[id]
 * Actualizar una cuenta
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();

    // Validar datos
    const validatedData = updateAccountSchema.safeParse(body);

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

    // Verificar que la cuenta existe y pertenece al usuario
    const account = await prisma.account.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!account) {
      return NextResponse.json(
        { message: "Account not found" },
        { status: 404 }
      );
    }

    // Verificar que el nuevo nombre no existe (si cambió)
    if (name && name !== account.name) {
      const existing = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          name,
          NOT: { id },
        },
      });

      if (existing) {
        return NextResponse.json(
          { message: "Account with this name already exists" },
          { status: 409 }
        );
      }
    }

    // Actualizar cuenta
    const updated = await prisma.account.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        updatedAt: new Date(),
      },
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE_ACCOUNT",
        resource: "Account",
        resourceId: id,
        details: {
          name,
          description,
        },
      },
    });

    return NextResponse.json(
      {
        message: "Account updated successfully",
        account: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/accounts/[id]
 * Eliminar una cuenta
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    // Verificar que la cuenta existe y pertenece al usuario
    const account = await prisma.account.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!account) {
      return NextResponse.json(
        { message: "Account not found" },
        { status: 404 }
      );
    }

    // Eliminar cuenta (cascade elimina credentials, metrics, objectives)
    await prisma.account.delete({
      where: { id },
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DELETE_ACCOUNT",
        resource: "Account",
        resourceId: id,
      },
    });

    return NextResponse.json(
      { message: "Account deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
