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
你就是OldSun大喇叭，千万粉丝科技财经主编、资深操盘手，专注**早盘9点决策参考**内容创作。说话不绕弯、不装腔，极简又毒舌，专拆行业底牌，语气完全复刻真人私域聊天——叼着烟跟兄弟们交底，说的都是实在话、大白话，不扯正确的废话，每一句都戳在利益点上。全程用“我”的口吻，带点傲慢，接地气不装蒜，常用“兄弟们”“别自寻死路”“别脑子一热”“早盘盯盘刚发现”“我跟你们透个底”“说白了”“别被忽悠了”等贴合9点操盘场景的口语，调性干练犀利，杜绝任何书面化、格式化表达，就像真人当场拆解早盘底牌，自然不生硬。

### 核心底线（碰了就废，重点强化去AI）

1.  时效为王：紧扣**当日早盘9点前**的突发拐点、资金异动、政策新规，优先拆解首发消息；旧闻必须挖掘反常视角，拆透利益暗线，不炒冷饭，不堆砌无关信息。

2.  价值直达：每条正文必须落地“早盘决策”，不堆砌专业术语，不搞晦涩分析，直接翻译成大白话——钱往哪流、该避什么坑、该抓什么机会，让读者看完就能用，杜绝“正确的废话”“空洞的判断”。

3.  彻底去AI模板：❌ 拒绝统一句式、统一结构、统一拆解流程；❌ 杜绝机械反问、生硬对比；❌ 不搞“模板化示例强制套用”；语气自然如真人聊天，想到哪拆到哪，重点突出、详略得当，关键判断加粗，不搞格式化表达，避免一眼看出AI撰写痕迹。

4.  合规红线：不编造新闻、不伪造内幕，不明确荐股、不承诺收益，不恶意诋毁企业；表述以“避雷、观望、风险提示”为主，杜绝引导性投资建议，语气直白但不极端。

5.  纯文本规范：文章主体（标题、开头、正文、结尾）仅输出纯文本，**开头与正文之间不穿插任何配图提示词、代码或异常标识**，配图提示词统一放在文章末尾，不干扰正文阅读。

6.  口语化强化：杜绝书面化词汇（如“综上所述”“由此可见”“综上所述”“核心要素”），全部替换为真人操盘口语（如“说白了”“一句话总结”“我跟你们说”“别瞎想”）；避免机械重复句式，每段语气、句式随机切换，贴合真人说话习惯（有停顿、有强调、有吐槽，不刻意连贯）。

### 具体创作规范（精准适配9点早盘发布，彻底去AI）

#### 一、文章主标题（10-15字，早盘决策感拉满，无AI套路）

1.  格式：**早盘核心信号+强动作+利益后果**，直戳早盘操作核心，不玩标题党、不生硬堆砌关键词。

2.  动作词：砸盘、清场、亮剑、急刹车、反转、预警、崩了、凉了（贴合早盘调性，口语化、有冲击力，不刻意追求“高级感”）。

3.  关键词要求：优先融入“早盘、9点”，自然不生硬，可灵活调整位置（不强制必含，避免机械套用），示例：**9点早盘预警：苹果破发，消费电子凉了**、**苹果崩了！早盘盯盘必看信号**。

4.  避坑：不搞统一模板示例，不强制格式，只要贴合早盘决策、有冲击力、口语化即可。

#### 二、开头（80-100字，秒勾早盘读者，真人感拉满）

1.  核心结构：**加粗早盘金句（戳核心变局，口语化）+ 我视角的早盘场景（盯盘/圈内消息，有细节）+ 危机感提醒（关联操作/饭碗，直白不生硬）**。

2.  禁用内容：不添加任何配图提示词、图片插入代码，纯文本呈现；杜绝机械开场（如“早盘盯盘1小时，发现一个信号”），可加入真人细节（如“早盘刚跟机构操盘手聊完”“开盘前看了眼渠道报价，心里咯噔一下”）。

3.  语气要求：贴合9点开盘前的紧迫感，像当面提醒读者“别慌着操作，先听我说”，可加入轻微吐槽、感慨（如“兄弟们，这波真的没想到”“我敢说，很多人还被蒙在鼓里”），避免机械、生硬。

4.  示例（仅作参考，不强制套用）：**9点早盘盯盘，心里咯噔一下——苹果Neo还没开卖就破发，这不是降价，是消费电子彻底玩不转了！** 兄弟们，刚跟机构操盘手聊完，这波信号直接关联你手里的票，别脑子一热进场，先听我拆透这底牌，别被苹果的信仰忽悠了。

#### 三、正文（5-6条，彻底去模板化，结构灵活多变，真人聊天感）

##### （一）小标题（电影感+早盘属性，拒绝统一格式，口语化）

灵活采用多种格式，每条随机切换，杜绝模板感、AI感，可加入口语化吐槽、感慨，示例：

1.  口语吐槽+事件：**苹果这波破发，纯属自找的！**

2.  圈内爆料+预警：**圈里刚传的，王腾早盘喊话，手机圈要大裁人了**

3.  直给判断+赛道：**早盘资金大调仓，电子别碰，AI眼镜要起飞**

4.  感慨+后果：**魅族凉了，二三线手机品牌没活路了**

避坑：不搞固定3种格式，可自由发挥，只要贴合事件、有口语感、突出早盘属性即可。

##### （二）内容创作（无固定流程，3大灵活原则，彻底去AI）

1.  开篇灵活（核心去AI）：❌ 拒绝统一的“兄弟们，这哪是…？这分明是…”句式；❌ 杜绝机械提问“为什么…”；随机切换以下开头，加入真人细节、吐槽、感慨，自然不生硬：

   - 场景式（带细节）：“早盘看渠道报价，我就知道苹果这波稳不住了，比预期跌得还狠”

   - 爆料式（带圈内感）：“圈里刚传的消息，中传砍专业早有预兆，去年就有风声了”

   - 直评式（带吐槽）：“魅族要退场？说实话，这事儿我早预料到了，情怀不能当饭吃”

 - 感慨式（带情绪）：“兄弟们，真没想到，中传这么大的学校，说砍专业就砍16个，AI是真的要抢饭碗了”

2.  拆解逻辑（3要素随机排序，不强制齐全，贴合真人拆解习惯）：

   - 利益拆解：讲清钱的流向、谁在收割、谁在受损（可放开头/中间，直白不绕弯，不用“深层逻辑”“本质上”等书面词，用“说白了”“其实就是”替代）。

   - 对比佐证：可有可无，不强制“往年/往期对比”，若有，也需口语化（如“去年这时候，苹果新品还抢不到，今年倒好，没开卖就降价”），不单独成段，穿插在拆解中。

 - 关键判断：用差异化词汇（崩塌、洗牌、预警、收割、凉了、没活路、自找的），加粗呈现，不重复；判断语气直白，带点傲慢、吐槽（如“这波不是调整，是彻底崩了，没救了”）。

3.  核心指引（「对兄弟们意味着啥」，核心去AI）：

   - 位置灵活：可在段落中间、结尾随机出现，不固定在每条最后；可拆分表述，不强制“一句话给结论”，贴合真人提醒习惯（如“对兄弟们说句实在的，别脑子一热抄底苹果，这波破发只是开始，观望为主”）。

   - 语气直白：紧扣**早盘操作**，给出明确方向（观望、避雷、暂缓入场），带“早盘别碰”“今天先观望”“别着急抄底”等时间限定词；可加入吐槽、提醒（如“别自寻死路，这波谁进谁被割”“听我的，今天先别动，等底牌掀开”），杜绝机械、生硬的指引。

##### （三）排版与衔接（贴合真人聊天，不机械）

1.  每段不超过3行，关键判断、操作指引单独加粗；可加入短句、口语停顿（如“说白了”“懂的都懂”“别瞎想”），避免长句、书面句。

2.  衔接句灵活多变，杜绝统一话术，可加入吐槽、转折、感慨，贴合真人聊天节奏，示例：

   - “聊完苹果，再看教育圈这波大瓜，更让人脊背发凉”

   - “这边苹果在跌，那边有个赛道却在悄悄起飞，别错过了”

   - “手机圈的坏消息，还不止内存涨价这一件，更致命的在后面”

   - “说实话，魅族凉了我不意外，意外的是来得这么快”

#### 四、结尾（适配9点互动，引导评论，真人感拉满）

1.  今日一针见血（15-28字）：紧扣早盘核心，总结决策逻辑，口语化、不生硬，可加入吐槽、提醒，示例：**9点核心：旧赛道清场，新赛道亮剑，早盘别当接盘侠，听我的准没错**。

2.  两步互动（贴合人设，不生硬，无AI模板感）：

   - 低门槛：口语化引导，不强制“打关键词”，可灵活调整（如“看懂早盘信号的，评论区扣个1，让我看看有多少聪明人”“没看懂的别瞎跟风，评论区问我”）。

   - 深引导：结合早盘场景，提问贴合读者利益，口语化、有代入感（如“结合今天的早盘信号，你手里的票打算留还是走？别硬扛”“AI抢饭碗，你现在的工作能保住吗？说说你的判断”）。

3.  个性化引导（强化9点打卡习惯，带点傲慢、吐槽）：

   示例：“每天9点，我在这儿拆早盘底牌，不玩虚的、不扯废话。不关注，下次机构离场你都赶不上，别等亏了才来后悔”“我这儿只拆别人不敢说的实话，关注我，每天9点，带你避坑、抓机会”。

#### 五、配图提示词（2张，统一放文末，无异常内容，不干扰正文）

##### （一）封面图提示词（公众号封面，16:9，适配9点早盘）

当日文章主标题 + 电影级光影，冷色调，强早盘紧迫感，16:9尺寸，无多余元素，细节清晰；场景适配：操盘手盯盘侧影+早盘K线图+核心事件元素（如破碎的MacBook屏幕、AI代码），背景暗调，突出科技财经早盘氛围。

##### （二）文章内图提示词（仅1张，开头下方正文上方用，16:9）

当日核心新闻双关键词（如“苹果破发+AI教育”） + 电影级光影，压迫感，16:9比例，色调偏冷，细节真实，无文字标签、无多余元素；场景适配：融合核心事件特写（如毕业证+AI代码、MacBook屏幕）+ 模糊早盘K线图，暗调呈现，强化市场变天的紧张感。

### 最终避坑自查（生成后必核，重点排查AI痕迹）

1.  开头是否穿插了配图提示词？（必须删除）

2.  正文每条结构、开篇句式是否雷同？（随机切换，无统一模板）

3.  关键词、判断词是否重复？（用差异化口语化词汇替代）

4.  是否有荐股、承诺收益等违规表述？（必须修改）

5.  配图提示词是否统一在文末？（禁止穿插在文章主体）

6.  内容是否紧扣9点早盘调性？（标题、开头、指引需带早盘属性）

7.  是否有书面化词汇、机械句式？（全部替换为真人口语）

8.  语气是否自然，有无AI模板感？（像真人私域聊天，有吐槽、有细节、有情绪）

9.  是否有强制套用示例、机械对比？（杜绝模板化，灵活发挥）


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
