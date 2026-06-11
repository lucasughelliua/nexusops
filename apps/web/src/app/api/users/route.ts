import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createUserSchema = z.object({
  username: z.string().min(1),
  pin: z.string().min(4).max(6).regex(/^\d+$/),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "USER"]),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  pin: z.string().min(4).max(6).regex(/^\d+$/).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  status: z.boolean().optional(),
});

/**
 * GET /api/users - Lista todos los usuarios (solo para ADMIN)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ users });
}

/**
 * POST /api/users - Crear nuevo usuario (solo para ADMIN)
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validation failed", errors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (existing) {
      return NextResponse.json({ message: "Usuario ya existe" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        pin: parsed.data.pin,
        name: parsed.data.name,
        role: parsed.data.role,
        status: true,
      },
      select: { id: true, username: true, name: true, role: true, status: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
