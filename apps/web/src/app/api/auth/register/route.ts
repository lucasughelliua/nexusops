import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { registerSchema } from "@/lib/validators/auth";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();

    // Validate input
    const validatedData = registerSchema.safeParse(json);
    if (!validatedData.success) {
      return NextResponse.json(
        {
          message: "Validation failed",
          errors: validatedData.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, email, password } = validatedData.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "User with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "REGISTER",
        resource: "User",
        resourceId: user.id,
      },
    });

    return NextResponse.json(
      {
        message: "User created successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
