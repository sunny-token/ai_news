import { generateCoverImage } from "@/app/lib/gemini";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { title } = await request.json();

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 },
      );
    }

    const coverImageBase64 = await generateCoverImage(title);

    if (coverImageBase64) {
      return NextResponse.json({
        success: true,
        coverImage: `data:image/jpeg;base64,${coverImageBase64}`,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Failed to generate image" },
        { status: 500 },
      );
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 },
    );
  }
}
