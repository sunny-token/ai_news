import { GoogleGenAI } from "@google/genai";

// 初始化 Google GenAI
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// 生成封面图 (使用 Pollinations.ai 免费接口)
export const generateCoverImage = async (
  title: string,
): Promise<string | null> => {
  console.log(
    `🎨 [API] Generating cover image via Pollinations (Free) for: ${title}...`,
  );
  try {
    // 如果传入的 title 看起来已经是一个详细的 prompt（包含 "tech news" 或 "no text"），则直接使用
    // 否则，使用默认模板进行拼接
    const prompt = title;
    // if (
    //   !title.toLowerCase().includes("tech news") &&
    //   !title.toLowerCase().includes("no text")
    // ) {
    //   prompt = `tech news cover image, futuristic, 3d render, neon lights, high quality, 8k, minimalism, no text, subject: ${title}`;
    // }

    const encodedPrompt = encodeURIComponent(prompt);

    // 宽高比 2.35:1 -> 1280x544
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=544&nologo=true&seed=${Math.floor(Math.random() * 10000)}`;

    console.log("🔗 [API] Pollinations URL:", url);

    const response = await fetch(url, {
      method: "GET",
      // timeout: 15000 // default fetch has no timeout, relying on system
    });

    if (!response.ok) {
      console.error(
        `Pollinations API failed: ${response.status} ${response.statusText}`,
      );
      throw new Error("Pollinations API fail");
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    console.log("✅ [API] Free cover image generated successfully.");
    return base64;
  } catch (error) {
    console.error("❌ [API] Cover image generation failed:", error);
    // 失败时不阻断，返回 null
    return null;
  }
};

export const generateArticleContent = async (
  prompt: string,
): Promise<string> => {
  try {
    console.log("🤖 [API] Calling Gemini 2.5 Flash model...");
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
    });
    console.log("✨ [API] Generation successful.");
    return response.text || "生成摘要失败，无内容返回。";
  } catch (error) {
    console.error("Gemini generation failed:", error);
    return "生成摘要失败，请稍后重试。";
  }
};
