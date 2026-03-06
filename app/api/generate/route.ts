import { generateArticleContent, generateCoverImage } from "@/app/lib/gemini";
import { getWeChatService } from "@/app/lib/wechat";
import * as cheerio from "cheerio";
import { NextResponse } from "next/server";

// 定义类型（保留原有）
interface HotNewsItem {
  platform: string;
  title: string;
  url: string;
}

// 以下抓取热点、生成文章逻辑
// 抓取 36Kr 热点
const fetch36Kr = async (): Promise<HotNewsItem[]> => {
  console.log("🔍 [API] Fetching hot news from 36Kr...");
  try {
    const response = await fetch("https://36kr.com/newsflashes", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      next: { revalidate: 300 }, // 缓存5分钟
    });

    if (!response.ok) {
      console.error(`Fetch 36Kr failed: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const newsList: HotNewsItem[] = [];

    $(".newsflash-item .item-title").each((_, element) => {
      const title = $(element).text().trim();
      const href = $(element).attr("href");
      if (title && href) {
        newsList.push({
          platform: "36Kr",
          title,
          url: href.startsWith("http") ? href : `https://36kr.com${href}`,
        });
      }
    });

    console.log(`✅ [API] Found ${newsList.length} items from 36Kr.`);
    return newsList;
  } catch (error) {
    console.error("Failed to fetch 36Kr:", error);
    return [];
  }
};

// 抓取 IT之家 热点
const fetchITHome = async (): Promise<HotNewsItem[]> => {
  console.log("🔍 [API] Fetching hot news from ITHome...");
  try {
    const response = await fetch("https://www.ithome.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      console.error(`Fetch ITHome failed: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const newsList: HotNewsItem[] = [];
    const seen = new Set<string>();

    $('a[href*="/0/"], a[href*="/html/"]').each((_, element) => {
      const title = $(element).text().trim();
      const href = $(element).attr("href");

      if (title.length > 10 && href && !seen.has(href)) {
        seen.add(href);
        newsList.push({
          platform: "ITHome",
          title,
          url: href.startsWith("http") ? href : `https://www.ithome.com${href}`,
        });
      }
    });

    console.log(`✅ [API] Found ${newsList.length} items from ITHome.`);
    return newsList;
  } catch (error) {
    console.error("Failed to fetch ITHome:", error);
    return [];
  }
};

// 聚合多平台热点
const aggregateHotNews = async (): Promise<HotNewsItem[]> => {
  const [news36Kr, newsITHome] = await Promise.all([
    fetch36Kr(),
    fetchITHome(),
  ]);

  const allNews = [...news36Kr, ...newsITHome];

  // 简单去重：基于标题完全一致的去重
  const uniqueNews = Array.from(
    new Map(allNews.map((item) => [item.title, item])).values(),
  );

  console.log(
    `✅ [API] Total unique items after aggregation: ${uniqueNews.length}`,
  );
  // 限制总数传给 LLM
  return uniqueNews.slice(0, 50);
};

const generateArticle = async (newsList: HotNewsItem[]): Promise<string> => {
  console.log(
    `📝 [API] Generating article for ${newsList.length} news items...`,
  );
  if (newsList.length === 0) return "今日暂无热点新闻。";

  const prompt = `
# Role
你叫 OldSun大喇叭，千万粉丝科技财经主编。
风格：极简、毒舌、直拆底牌。拒绝 AI 翻译腔，像在高端私域社群里的随口点拨。

# Task
基于新闻列表，撰写去 AI 化的《科技财经早报》。

# 核心逻辑
1. 碎语化：多换行，多留白。严禁使用任何 HTML 标签（如 <br>）。
2. 物理换行：每段不超过 3 行。段落之间双回车实现大留白。
3. 毒舌属性：严禁温和。多用“砸钱”、“离场”、“收割”、“套现”、“遮羞布”、“割肉”。

# 写作规范

## 1. 文章主标题
* 严禁任何符号。字数 10 个字符左右。
* 必须包含：重估 / 洗牌 / 聪明钱 / 幻觉 / 遮羞布 / 逻辑变了 / 拐点（选其一）。

## 2. 开头
* 严禁模板化。直接给出一句带刺的、看透真相的开场白。

## 3. 正文 (5-6条)
* ### 小标题
* **事实概括一行（加粗）**
* 点评要求：
    - 别解释，直接定性。
    - 包含：至少一处往年/往季对比。
    - 包含：一处“很多人觉得这是在救火，我倒觉得这是在送终。”
    - 排版：通过多次换行实现碎语感。严禁代码块、列表符号（- 或 1.）。

## 4. 结尾与留存
* 今日一针见血：15-28 字的一句话战略总结。
* 互动：提出一个涉及利益分配的深度问题。
* 固定引导 (随机三选一)：
    1. 看透资金底牌。点个关注，每天三分钟剥开科技遮羞布。
    2. 这里只聊钱流向了谁。点赞关注，进场聪明钱的圈子。
    3. 别在新闻废墟里捡垃圾。点个关注，听懂高端局的弦外之音。

## 5. AI 生图参考
* 格式：### AI 生图参考
* 规则：对应每条新闻，必须包含“正能量、合法”导向。
* 描述词：[新闻标题] + [具体画面描述：3D渲染/高精摄影，16:9]。

# 待处理新闻列表：
${newsList.map((item, index) => `${index + 1}. [${item.platform}] ${item.title}`).join("\n")}
`;
  //   const prompt = `
  // 你叫 OldSun_AI，是一位拥有千万粉丝的科技财经公众号主编。你的核心使命是做"最懂新手的科技领路人"。
  // 请按照以下「10万+爆款模板」，基于新闻列表撰写一篇可直接发布到微信公众号的科技财经早报。

  // 【爆款模板规则（严格执行，缺一不可）】
  // 1. 标题规则（必须吸睛且合规）：
  //    - 格式：【🔥科技早报｜核心看点】
  //    - 字数：18-28字
  //    - 风格：有冲突/有看点/有价值，例如「今天全是大消息，看完不迷路！」「关键信号出现，行业要变天了」

  // 2. 开头规则（3选1自动适配，必须体现 OldSun_AI 身份）：
  //    - 模板1：大家好，我是OldSun_AI。每天3分钟，带你读懂全网科技、财经大事。
  //    - 模板2：OldSun_AI 准时报到！早报不啰嗦，只讲重点、干货、影响。
  //    - 模板3：我是OldSun_AI。今日重磅汇总来了，热点、机会、风险一次说清。

  // 3. 正文规则（新手友好版）：
  //    - **新手引导**：遇到晦涩难懂的专业术语（如AGI、Transformer、算力底座等），必须用"一句话比喻"或"大白话"解释，降低阅读门槛；
  //    - 自动去重合并新闻，筛选5-8条最重磅核心事件；
  //    - 每条格式：emoji + **核心主体** + 核心事件 + 关键数据/影响/通俗解释；
  //    - emoji精准匹配主题（🤖/⚡️/💸/📱/☁️/🏦/🚀），不重复；
  //    - 核心主体/关键数据/重磅动作必须**加粗**；
  //    - 每条单独一行，条目间空一行（仅一个换行符）。

  // 4. 结尾规则：
  //    - 第一行：**今日一针见血**：+ 15-28字犀利观点（从模板库选：①AI与新能源仍是主线，行业加速洗牌；②政策与资本双重发力，硬科技迎来红利；③算力降价+应用爆发，AI商业化进入深水区；④消费电子回暖，实体经济成核心）；
  //    - 第二行：互动话术（从模板库选：①今天哪条新闻最震撼？评论区聊聊～；②你更看好AI还是新能源？留下你的判断！；③每日早报，点赞+在看，明天准时送达！）。

  // 5. 格式红线：
  //    - 仅使用换行、emoji、**加粗**，无任何复杂排版；
  //    - **不要**输出 <pre> 标签或 Markdown 代码块（\`\`\`）；
  //    - 纯文本输出，利用换行符控制排版；
  //    - 全文350-550字，语言专业+轻微网感，符合微信阅读习惯。

  // 6. 附加元数据（非常重要，必须在文章最末尾输出）：
  //    - 请将文章标题翻译为英文，单独一行输出，格式严格为：METADATA_ENGLISH_TITLE: <英文标题>
  //    - 请生成一个用于生成封面图的英文提示词，必须包含 'no text', 'futuristic', 'tech news', '8k' 等关键词，并包含对文章核心主题的画面描述。单独一行输出，格式严格为：METADATA_COVER_PROMPT: <英文提示词>

  // 新闻列表：
  // ${newsList.map((item, index) => `${index + 1}. [${item.platform}] ${item.title}`).join("\n")}

  // 输出要求：
  // 直接输出纯文本内容，不要包含任何 HTML 标签（如 <pre>），包含末尾的元数据行。
  // `;

  return await generateArticleContent(prompt);
};

// 辅助函数：从文章内容中提取标题
const extractTitle = (articleContent: string): string => {
  const match = articleContent.match(/【🔥科技早报｜([^】]+)】/);
  if (match && match[1]) {
    return `【🔥科技早报｜${match[1]}】`;
  }
  return "科技财经早报"; // 默认标题
};

// API主函数（保留原有）
export async function GET() {
  console.log("🚀 [API] Starting aggregated generation request...");
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "未配置Gemini API Key" },
        { status: 500 },
      );
    }
    const hotNews = await aggregateHotNews();
    if (hotNews.length === 0) {
      return NextResponse.json(
        { success: false, error: "未抓取到任何财经/科技热点" },
        { status: 400 },
      );
    }
    let article = await generateArticle(hotNews);

    // 移除可能存在的 Markdown 代码块或 pre 标签
    article = article
      .replace(/^```(?:\w+)?\n|\n```$/g, "")
      .replace(/^<pre>\s*|\s*<\/pre>$/g, "")
      .trim();

    // 提取英文标题
    let englishTitle = "";
    const englishTitleMatch = article.match(/METADATA_ENGLISH_TITLE:\s*(.+)$/m);
    if (englishTitleMatch && englishTitleMatch[1]) {
      englishTitle = englishTitleMatch[1].trim();
      article = article.replace(englishTitleMatch[0], "").trim();
    }

    // 提取封面提示词
    let coverPrompt = "";
    const coverPromptMatch = article.match(/METADATA_COVER_PROMPT:\s*(.+)$/m);
    if (coverPromptMatch && coverPromptMatch[1]) {
      coverPrompt = coverPromptMatch[1].trim();
      article = article.replace(coverPromptMatch[0], "").trim();
    }

    const title = extractTitle(article); // 提取标题

    // 尝试发布到微信
    let wechatDraftId = null;
    const wechatPublishId = null; // 预留变量，暂未使用
    // 尝试生成封面图
    let coverImageBase64 = null;
    try {
      // 优先使用提取的 Prompt，否则使用英文标题，最后回退到中文标题
      const inputForCover = coverPrompt || englishTitle || title;
      console.log(
        `🎨 [API] Using input for cover generation: "${inputForCover.substring(0, 50)}..."`,
      );
      coverImageBase64 = await generateCoverImage(inputForCover);
    } catch (e) {
      console.error("Cover generation main error:", e);
    }

    const needUplodaWeChat = false;
    const wechatService = getWeChatService();
    if (wechatService && needUplodaWeChat) {
      try {
        // 1. 上传封面图到微信 (获取 thumb_media_id)
        let thumbMediaId: string | undefined = undefined;
        if (coverImageBase64) {
          console.log("📤 [API] Uploading cover image to WeChat...");
          try {
            // 传入 Base64 字符串
            thumbMediaId = await wechatService.uploadThumb(coverImageBase64);
            console.log(
              `✅ [API] Cover image uploaded. Media ID: ${thumbMediaId}`,
            );
          } catch (uploadError) {
            console.error(
              "❌ [API] Failed to upload cover image, using default if available:",
              uploadError,
            );
          }
        }

        console.log("📤 [API] Publishing to WeChat Draft...");
        const htmlContent = wechatService.formatContentToHtml(article);

        wechatDraftId = await wechatService.createDraft({
          title: title,
          content: htmlContent,
          digest: article.substring(0, 50) + "...", // 简单的摘要
          author: "AI News Bot",
          thumb_media_id: thumbMediaId, // 传入新生成的封面ID
        });
        console.log(`✅ [API] WeChat Draft Created: ${wechatDraftId}`);

        // 自动群发（慎用：每天有配额限制，且订阅号只能群发1次/天）
        // 如果仅需生成的草稿供人工确认，可注释掉下方代码
        try {
          console.log(`📤 [API] Publishing Draft ${wechatDraftId}...`);
          // 注意：发布接口会将内容发布出去，订阅号一天只能发一次
          // wechatPublishId = await wechatService.publishDraft(wechatDraftId);
          console.log(
            `✅ [API] WeChat Published Successfully: ${wechatPublishId}`,
          );
        } catch (publishError) {
          console.error("❌ [API] Failed to publish draft:", publishError);
        }
      } catch (wechatError) {
        console.error("❌ [API] Failed to publish to WeChat:", wechatError);
        // 不阻断主流程，只记录错误
      }
    } else {
      console.log(
        "ℹ️ [API] WeChat service not configured (missing env vars). Skipping publish.",
      );
    }

    return NextResponse.json({
      success: true,
      hotNews,
      article,
      title,
      coverImage: coverImageBase64
        ? `data:image/jpeg;base64,${coverImageBase64}`
        : null, //以此格式返回给前端使用
      wechatDraftId,
      wechatPublishId,
      date: new Date().toLocaleDateString("zh-CN"),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs"; // 使用 Node.js Runtime 以支持 axios 和 form-data
