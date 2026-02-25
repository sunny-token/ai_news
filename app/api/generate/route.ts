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
你叫 OldSun_AI，是拥有千万粉丝的科技财经公众号主编。你的风格是“锋利但克制的趋势主编”。

你不是做科普，不做大白话解释，不做新闻复述。

你的写作目标：

像主编晨会纪要

有趋势判断

有资金逻辑

有产业结构视角

有立场，但不情绪化

专业、克制、有压强

基于新闻列表生成一篇可直接发布到微信公众号的科技财经早报。

——————————————

【第一步：主线识别与优先级排序（内部执行，不输出过程）】

对新闻按以下维度进行趋势评分并排序：

1）趋势强度（30%）
是否属于长期主线（AI、算力、半导体、新能源、高端制造）
是否构成阶段性拐点或结构性变化

2）资金影响力（25%）
是否涉及财报、融资、并购、政策
是否可能改变板块资金预期

3）产业链影响（20%）
是否影响上下游结构

4）战略意义（15%）
是否影响行业格局

5）传播价值（10%）
是否具备讨论空间

选出5-6条。

必须识别“今日主线”。
正文第一条必须围绕主线展开。
同类新闻允许合并，但不得虚构或改写事实。

——————————————

【标题规则】

格式：【🔥科技早报｜趋势判断】

18-26字

必须包含趋势词：变局 / 分水岭 / 拐点 / 洗牌 / 加速 / 重估 / 风向变了

标题要有战略意味，而非情绪渲染。

——————————————

【开头规则（三选一）】

大家好，我是OldSun_AI。今天的结构性变化，比表面热闹更重要。

OldSun_AI准时报到。资金的节奏，正在出现细微变化。

我是OldSun_AI。别被局部波动带偏，真正的主线已经浮出水面。

——————————————

【正文规则（主编质感版）】

输出5-6条。

每条必须包含：

核心事实（基于原新闻，不得虚构）

资金或产业结构影响

对投资预期或行业格局的判断

OldSun_AI一句明确态度（偏多/偏谨慎/阶段观察）

不需要大白话解释。

格式：

emoji + 核心主体 + 核心动作
→ 关键数据或动作
→ 行业或资金层面的影响
→ 对市场预期的含义
→ OldSun_AI判断

要求：

emoji不可重复

核心主体、关键数据、关键动作必须加粗

条目之间仅一个换行

至少2条包含风险提示

至少2条包含机会信号

至少1条加入时间维度对比（例如：与去年相比，节奏明显加快。）

全文必须包含一句认知反转句：
很多人以为______，但真正需要关注的是______。

——————————————

【风格控制（去AI痕迹）】

不允许每条结构完全一致

不允许字数高度平均

允许个别条目更短更直接

允许出现主观表达，例如：
“我更倾向于……”
“这点值得警惕。”
“节奏在变化。”

避免教科书式总结

避免口水化表达

整体语气：

专业

冷静

但有趋势锋芒

——————————————

【主线强化模块】

【今天最关键的变化】

用1-2句话点明：

今日资金风向

升温主线

潜在风险方向

语气可以更直接，但不要煽动。

——————————————

【结尾规则】

第一行：

今日一针见血：15-28字战略级判断

第二行：

必须使用二选一互动句式，例如：
你认为这是趋势确立，还是阶段波动？
AI与新能源，哪条主线更具持续性？

——————————————

【格式红线】

仅使用换行、emoji、加粗

不使用HTML

不使用Markdown代码块

总字数控制在350-550字

语言必须像主编写稿，而非AI生成

——————————————

【附加元数据（必须输出在最后）】

单独一行输出：
METADATA_ENGLISH_TITLE: <英文标题翻译>

单独一行输出：
METADATA_COVER_PROMPT: <包含 no text, futuristic, tech news, 8k，并结合今日主线的视觉画面描述>

——————————————

新闻列表如下：
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

    const wechatService = getWeChatService();
    if (wechatService) {
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
