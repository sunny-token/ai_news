import { GoogleGenAI } from "@google/genai";

// 初始化 Google GenAI
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * 生成封面图的健壮方法
 * 逻辑：Flux AI -> Turbo AI -> Unsplash 摄影图 (兜底)
 */
export const generateCoverImage = async (
  title: string,
): Promise<string | null> => {
  const seed = Math.floor(Math.random() * 10000);

  // 1. 处理 Prompt：去掉 AI 塑料味，增加人类审美感词汇
  // 既然你喜欢“人写的”文案，图片也该更有质感
  const cleanTitle = title.replace(/[^\w\s\u4e00-\u9fa5]/gi, ""); // 简单清洗
  const refinedPrompt = `Cinematic photography of ${cleanTitle}, minimalist composition, soft natural lighting, high depth of field, premium tech aesthetic, 4k, professional photography --no text, no watermark`;
  const encodedPrompt = encodeURIComponent(refinedPrompt);

  // 定义候选 URL 列表 (按质量从高到低排序)
  const sources = [
    {
      name: "Flux AI (High Quality)",
      url: `https://pollinations.ai/p/${encodedPrompt}?width=1280&height=544&seed=${seed}&model=flux&nologo=true`,
      timeout: 25000, // Flux 生成慢，多给点时间
    },
    {
      name: "Turbo AI (Fast)",
      url: `https://pollinations.ai/p/${encodedPrompt}?width=1280&height=544&seed=${seed}&model=turbo&nologo=true`,
      timeout: 10000,
    },
    {
      name: "Unsplash (Real Photo Fallback)",
      url: `https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1280&h=544&q=80`, // 默认一张高级科技感大图
      timeout: 5000,
    },
  ];

  for (const source of sources) {
    try {
      console.log(`🚀 [API] Attempting: ${source.name}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), source.timeout);

      const response = await fetch(source.url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 验证返回的是否确实是图片数据（防止 530 返回的是 HTML 报错页）
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("image")) {
          console.log(`✅ [API] Success via ${source.name}`);
          return buffer.toString("base64");
        }
      }

      console.warn(
        `⚠️ [API] ${source.name} failed with status: ${response.status}`,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.error(`⏱️ [API] ${source.name} timed out.`);
      } else {
        console.error(`❌ [API] ${source.name} error:`, error.message);
      }
    }
    // 当前源失败，自动进入下一个循环
  }

  console.error("💀 [API] All image sources failed.");
  return null;
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
