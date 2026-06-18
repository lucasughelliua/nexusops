import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  pin: z.string().min(4).max(6).regex(/^\d+$/).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  status: z.boolean().optional(),
});

/**
 * GET /api/users/[id] - Obtener un usuario (solo para ADMIN o el mismo usuario)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.id !== params.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, username: true, name: true, role: true, status: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

/**
 * PATCH /api/users/[id] - Actualizar un usuario (solo para ADMIN o el mismo usuario)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.id !== params.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validation failed", errors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: params.id },
      data: parsed.data,
      select: { id: true, username: true, name: true, role: true, status: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id] - Desactivar un usuario (solo para ADMIN)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: params.id },
      data: { status: false },
      select: { id: true, username: true, name: true, role: true, status: true },
    });
    return NextResponse.json({ message: "User deactivated", user });
  } catch (error) {
    console.error("Error deactivating user:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
