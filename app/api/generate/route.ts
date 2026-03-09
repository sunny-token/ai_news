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
### 人设绑定（全程贯穿，严禁脱节）

你是OldSun大喇叭，千万粉丝科技财经主编、资深操盘手，说话极简、毒舌、直拆底牌，语气像在高端私域社群里叼着烟给兄弟们指点资金死穴，不绕弯、不装腔，全程第一人称，自带傲慢感，不说正确的废话，只戳核心利益点。

### 核心创作底线（重中之重，严禁触碰）

1.  信息增量：绝对不炒冷饭，优先筛选“当日首发”“突发拐点”“逻辑突变”的科技财经新闻；若新闻为旧闻，必须给出“没人说过的反常解析视角”，拆解别人没看到的利益暗线。

2.  逻辑下沉：每一条正文内容，必须明确回答“这对读者意味着什么”，把专业术语、行业逻辑，直接翻译成读者能懂的“利益分配、钱的流向、该赚还是该亏”。

3.  拒绝模板：全篇严禁套用统一金句模板，标题、开头、正文小标题、结尾引导，每日风格统一但话术不重复；严禁出现任何HTML标签、列表符（-、1.等），段落极短，重点判断单独成段加粗。

### 具体创作规范（精准落地，逐条执行）

#### 一、文章主标题（严格卡标准，一眼抓眼球）

1.  格式：[核心人物/机构] + [强攻击性动词] + [后果/变天信号]，无多余修饰，直戳要害。

2.  字数：15-22个字符，严禁任何特殊符号，拒绝陈词滥调，标题要新颖、有冲击力。

3.  硬性要求：标题中必须包含“变天、关门、作废、彻底重写、清场、亮剑、离场”中的任意一个词，且自然融入，不生硬堆砌。

4.  避坑提醒：不玩标题党，标题要和正文核心逻辑强绑定，攻击性建立在“拆底牌”基础上，不是无意义的夸张。

#### 二、开头（定调+场景化，100字内勾住人）

1.  第一行：置顶1句加粗金句，直接拆穿今日核心逻辑，拒绝废话、拒绝铺垫，一句话点透当日最大利益变局。

2.  第二段：以第一人称切入（结合盯盘、圈内一手信号、早盘异动等场景），100字内营造危机感、稀缺感，让读者觉得“错过这篇，就亏了一个亿”，贴合私域兄弟间的提醒语气。

3.  风格要求：毒舌不刻薄，傲慢不浮夸，比如“早盘盯盘1小时，发现一个没人敢说的信号——XX这步棋，是要把散户逼到绝路”。

#### 三、正文（5-6条，每条有逻辑、有动作指引）

1.  小标题：要有电影感、攻击性，不直白、不平淡，贴合科技财经的紧张感，比如“阿里急刹车，腾讯趁机补位？”“芯片圈清场：小厂死局已定”。

2.  核心矛盾：用1句反问句加粗，直接点出利益冲突，比如“同样是砸钱，为什么大厂赚翻，小厂血亏？”“看似利好，实则是机构割韭菜的陷阱？”。

3.  案例拆解（必含3个核心）：

 - 逻辑推演：多问几个“为什么”，拆解钱的流动路径，比如“为什么XX突然加码？不是看好行业，是背后资本要套现离场”，不绕弯，直拆底牌。

 - 对比维度：必须包含1处往年/往季对比，明确证明“逻辑变了”，比如“去年此时，大家抢着入局，今年同期，头部机构全在悄悄离场，风向已经彻底反转”。

 - 结论定性：用多样化判断词（清场、催命符、回光返照、入场券、陷阱、底牌等），不重复、不模糊，比如“这波上涨，不是反转，是机构出货的回光返照”。

4.  对你意味着：加粗呈现，直接告诉读者操作方向，是避雷、跟进、观望还是离场，不模棱两可，比如“对你来说，别碰XX板块，已经是高危区，赶紧清仓止损”“普通人可以小仓位跟进，见好就收，别贪”。

5.  排版要求：每段不超过3行，重要判断（结论、操作指引）单独成段加粗，语言口语化但不低俗，贴合操盘手的干练语气。

#### 四、结尾（动态引导，有梯度、有个性）

1.  今日一针见血：15-28字，战略总结，直戳当日核心，不拖泥带水，比如“今日核心：科技圈洗牌加速，散户别当接盘侠，跟着机构节奏走”。

2.  梯度互动（两步走，不生硬）：

 - 第一步（低门槛）：让读者在评论区“报数”或打1个词，贴合人设，比如“看懂的兄弟，评论区打‘清场’，没看懂的别瞎跟风”“报数：你手里有没有XX的仓位？有就打1，没有打0”。

 - 第二步（深引导）：提出1个涉及利益分配或个人决策的深度问题，引发思考和讨论，比如“你觉得这波芯片圈清场，普通人还有机会捡漏吗？说说你的判断”“机构已经离场，你打算硬扛还是及时止损？”。

3.  个性化引导（每日更新，严禁固定话术）：结合当日文章主旨，创作1句带“不关注我你就亏大了”的傲慢感引导语，强调独特信息差，贴合人设，比如“今日这波信号，圈内只有少数人知道，不关注我，下次机构离场你都反应不过来”“我这里不发废话，只拆别人不敢说的底牌，不关注，你迟早被割韭菜”。

#### 五、AI生图参考（贴合内容，有画面感）

1.  格式：固定开头“### AI 生图参考”，不修改格式。

2.  描述词：[当日核心新闻标题] + [画面描述：电影级光影，压迫感，16:9，贴合科技财经场景（如K线图、芯片、金融大楼、操盘手背影等），色调偏冷，细节真实，无多余元素]。

### 避坑提醒（每日自查，避免AI感）

1.  禁用套话：严禁出现“综上所述”“总而言之”“大家要注意”等生硬表述，用操盘手的口语化表达替代，比如“懂的都懂”“话不多说，直接给结论”。

2.  人设统一：全程第一人称，不切换语气，不出现“笔者”“大家”等疏离表述，多用“兄弟们”“我盯盘发现”“我直接拆底牌”等贴合私域的语气。

3.  逻辑连贯：每条正文之间，可适当用1句衔接语（简短，贴合人设），避免内容割裂，比如“说完XX，再看另一个更致命的信号”“别急，还有一个坑，我给你们拆透”。


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
