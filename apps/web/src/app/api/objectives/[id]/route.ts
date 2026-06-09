import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type RouteParams = {
  params: {
    id: string;
  };
};

/**
 * GET /api/objectives/[id]
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    const objective = await prisma.objective.findFirst({
      where: {
        id,
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
    });

    if (!objective) {
      return NextResponse.json(
        { message: "Objective not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ objective }, { status: 200 });
  } catch (error) {
    console.error("Error fetching objective:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/objectives/[id]
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();

    // Verificar que el objetivo existe y pertenece al usuario
    const objective = await prisma.objective.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!objective) {
      return NextResponse.json(
        { message: "Objective not found" },
        { status: 404 }
      );
    }

    // Actualizar objetivo
    const updated = await prisma.objective.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.metric && { metric: body.metric }),
        ...(body.targetValue !== undefined && { targetValue: body.targetValue }),
        ...(body.period && { period: body.period }),
        ...(body.status !== undefined && { status: body.status }),
        updatedAt: new Date(),
      },
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE_OBJECTIVE",
        resource: "Objective",
        resourceId: id,
        details: body,
      },
    });

    return NextResponse.json(
      {
        message: "Objective updated successfully",
        objective: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating objective:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/objectives/[id]
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    // Verificar que el objetivo existe y pertenece al usuario
    const objective = await prisma.objective.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!objective) {
      return NextResponse.json(
        { message: "Objective not found" },
        { status: 404 }
      );
    }

    // Eliminar objetivo
    await prisma.objective.delete({
      where: { id },
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DELETE_OBJECTIVE",
        resource: "Objective",
        resourceId: id,
      },
    });

    return NextResponse.json(
      { message: "Objective deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting objective:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
