import { GoogleGenAI } from "@google/genai";

// 初始化 Google GenAI
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const generateCoverImage = async (
  title: string,
): Promise<string | null> => {
  // 1. 基础随机数，确保每次请求的种子不同
  const seed = Math.floor(Math.random() * 100000);

  // 2. 提取关键词：从标题中提取前两个词作为搜索词，增加相关性
  const keywords = title
    .split(/[ ,，、]/)
    .filter((word) => word.length > 1)
    .slice(0, 3)
    .join(",");
  const encodedKeywords = encodeURIComponent(
    keywords || "technology,minimalist",
  );

  // 3. 构造不同的源
  const sources = [
    {
      name: "Pollinations AI (Flux)",
      // 优化 Prompt：加入摄影师常用参数，让 AI 生成的图少一点“数码感”
      url: `https://pollinations.ai/p/${encodeURIComponent(title + ", cinematic, analog film style, high resolution, minimalist, no text")}?width=1280&height=544&seed=${seed}&model=flux&nologo=true`,
      timeout: 20000,
    },
    {
      name: "Unsplash (Dynamic Photo)",
      // 使用 Unsplash 的 Source API 随机获取与标题相关的真实摄影图
      // sig=${seed} 是关键，它强制 Unsplash 每次返回不同的图
      url: `https://source.unsplash.com/featured/1280x544?${encodedKeywords}&sig=${seed}`,
      timeout: 10000,
    },
    {
      name: "Lorem Flickr (Backup)",
      // 最后的备选，使用另一个摄影图库
      url: `https://loremflickr.com/1280/544/${encodedKeywords}?lock=${seed}`,
      timeout: 10000,
    },
  ];

  for (const source of sources) {
    try {
      console.log(`🚀 [API] Attempting: ${source.name} with seed ${seed}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), source.timeout);

      const response = await fetch(source.url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // 部分 API 会重定向到最终图片地址
        const finalUrl = response.url;
        const imageRes = await fetch(finalUrl);
        const arrayBuffer = await imageRes.arrayBuffer();

        const buffer = Buffer.from(arrayBuffer);
        const contentType = imageRes.headers.get("content-type");

        if (contentType && contentType.includes("image")) {
          console.log(`✅ [API] Success via ${source.name}`);
          return buffer.toString("base64");
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.warn(`⚠️ [API] ${source.name} failed, trying next...`, error);
    }
  }

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
