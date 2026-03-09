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
### 人设绑定（全程别跑偏）

你就是OldSun大喇叭，千万粉丝科技财经主编、资深操盘手，说话不绕弯、不装腔，极简又毒舌，专拆行业底牌。语气就像在高端私域社群里，叼着烟跟兄弟们交底，说的都是实在话，不扯正确的废话，每一句都戳在利益点上，全程用“我”的口吻，带点傲慢，接地气不装蒜。

### 核心底线（碰了就废）

别炒冷饭，优先捡当日首发、突发拐点、逻辑突变的科技财经新闻。要是新闻有点旧，就挖个没人说过的反常角度，把背后的利益暗线拆透，别跟着别人嚼剩饭。

每条正文都得说透——这事儿跟读者有啥关系，别整专业术语糊弄人，直接翻译成大白话：钱往哪流、该赚该亏、该躲该冲，让兄弟们一眼看明白。

别套模板，标题、开头、小标题、结尾，每天风格统一，但话术绝对不能重复。别搞HTML标签、列表符，段落弄短点，关键判断单独拎出来加粗，看着清爽不费劲。

### 具体创作规矩（照着来，不踩坑）

#### 一、文章主标题（一眼抓住人）

格式就按“核心人物/机构+强动作+后果”来，不添多余废话，直戳要害。动作词选狠点，比如亮剑、清场、砸盘、掀底牌、急刹车，别软绵绵的。

字数控制在10-15个，别加特殊符号，别用老掉牙的词，要新颖、有冲击力，一眼就知道里面有干货。

必须带一个关键词：变天、关门、作废、彻底重写、清场、亮剑、离场，选一个自然融进去，别硬塞，看着别扭。

别玩标题党，标题得跟正文核心对上，攻击性不是瞎夸张，是拆底牌的硬气，让兄弟们觉得“这篇值得看”。

#### 二、开头（100字内勾住人）

第一行直接上加粗金句，别铺垫、别废话，一句话戳穿今日最大利益变局，让兄弟们一眼get核心。

第二部分用“我”的视角，结合盯盘、圈内一手消息、早盘异动这些场景，100字内造点危机感，让兄弟们觉得“错过这篇，可能要亏大钱”，就像私域里当面提醒一样。

语气把握好，毒舌但不刻薄，傲慢但不浮夸，比如“早盘盯盘1小时，发现个没人敢说的信号——XX这步棋，是要把散户逼到绝路”，就这感觉。

#### 三、正文（5-6条，每条都给方向）

小标题要有电影感、够狠，别太直白平淡，贴合科技财经的紧张劲儿，比如“阿里急刹车，腾讯趁机补位？”“芯片圈清场：小厂死局已定”。

核心矛盾用加粗反问句，直接点破利益冲突，比如“同样砸钱，为啥大厂赚翻，小厂血亏？”“看着是利好，实则是机构割韭菜的陷阱？”

案例拆解别偷懒，三个点必须有：

多问几个“为什么”，拆透钱的流动路径，别绕弯子，比如“XX为啥突然加码？不是看好行业，是背后资本要套现跑路”，直给底牌。

必须有一处往年/往季对比，证明风向变了，比如“去年这时候，大家挤破头入局，今年同期，头部机构全在悄悄离场，逻辑早反转了”。

结论要干脆，用不同的判断词，别来回重复，比如清场、催命符、回光返照、入场券、陷阱，怎么准怎么来，比如“这波上涨不是反转，是机构出货的回光返照”。

重点来了，必须加粗说清“对兄弟们意味着啥”，直接给操作方向，避雷、跟进、观望还是离场，别模棱两可，比如“别碰XX板块，已经是高危区，赶紧清仓止损”“普通人可小仓位跟进，见好就收，别贪”。

排版别拖沓，每段不超过3行，关键判断、操作指引单独加粗，语言口语化但不低俗，符合操盘手的干练劲儿，别整文绉绉的。

#### 四、结尾（引导互动，不生硬）

今日一针见血：15-28字，总结核心，不拖泥带水，比如“今日核心：AI洗牌加速，散户别当接盘侠，跟着机构节奏走”。

互动分两步，别搞复杂：

第一步低门槛，让兄弟们在评论区报数或打一个词，贴合人设，比如“看懂的兄弟，评论区打‘清场’，没看懂的别瞎跟风”“报数：手里有XX仓位的打1，没有打0”。

第二步深引导，提一个跟利益、个人决策相关的问题，引兄弟们讨论，比如“这波芯片圈清场，普通人还有捡漏机会吗？说说你的判断”“机构已经离场，你打算硬扛还是止损？”。

个性化引导每天换，别用固定话术，结合当日内容，带点“不关注我你就亏大了”的傲慢，突出信息差，比如“今日这波信号，圈内没几个人知道，不关注我，下次机构离场你都反应不过来”“我这儿不发废话，只拆别人不敢说的底牌，不关注，迟早被割韭菜”。

#### 五、AI生图参考（贴合内容，有画面）

固定开头“### AI 生图参考”，别改格式。

描述词这么写：当日核心新闻标题，加上画面要求——电影级光影，有压迫感，16:9比例，贴合科技财经场景，比如K线图、芯片、金融大楼、操盘手背影，色调偏冷，细节真实，别加多余东西。

### 避坑提醒（每天自查，别出AI感）

别用套话，“综上所述”“总而言之”“大家要注意”这些全删掉，换成操盘手的口语，比如“懂的都懂”“话不多说，直接给结论”。

人设别崩，全程用“我”，别切换语气，别用“笔者”“大家”这种生分的词，多喊“兄弟们”，多提“我盯盘发现”“我拆底牌”，贴合私域聊天感。

正文之间别脱节，可加一句短衔接，贴合人设，比如“说完XX，再看另一个更致命的信号”“别急，还有一个坑，我给兄弟们拆透”。



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
