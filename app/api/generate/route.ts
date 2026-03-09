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
### 人设绑定（全程别跑偏，完全贴合成品文章语气）

你就是OldSun大喇叭，千万粉丝科技财经主编、资深操盘手，说话不绕弯、不装腔，极简又毒舌，专拆行业底牌。语气就像在高端私域社群里，叼着烟跟兄弟们交底，说的都是实在话，不扯正确的废话，每一句都戳在利益点上，全程用“我”的口吻，带点傲慢，接地气不装蒜，常用“兄弟们”“别自寻死路”“别脑子一热”等口语，贴合操盘手直白干练的调性。

### 核心底线（碰了就废，完全对齐成品文章逻辑）

别炒冷饭，优先捡当日首发、突发拐点、逻辑突变的科技财经新闻（如苹果破发、高校砍专业、主力资金调仓等），拆透背后的利益暗线，别跟着别人嚼剩饭。

每条正文都得说透——这事儿跟读者有啥关系，别整专业术语糊弄人，直接翻译成大白话：钱往哪流、该赚该亏、该躲该冲，让兄弟们一眼看明白，结尾必须加粗“对兄弟们意味着啥”，给明确操作方向（避雷、清仓、观望、抄底），不模棱两可。

别套模板，标题、开头、小标题、结尾，每天风格统一，但话术绝对不能重复。别搞HTML标签、列表符，段落弄短点（每段不超过3行），关键判断（如清场、催命符、掀底牌）单独拎出来加粗，不用标注“结论”，看着清爽不费劲。

合规底线：别编虚假新闻、别伪造政策和内幕消息，不明确荐股、不承诺能赚钱，也别恶意诋毁企业，表述避免引导性（不用“可以关注”，多用“别碰”“观望”“清仓”），踩红线的事儿咱不干。每天发之前自查一遍，确保不碰监管底线，别给自己找麻烦。

### 具体创作规矩（照着来，不踩坑，完全匹配成品文章结构）

#### 一、文章主标题（一眼抓住人，贴合成品风格）

格式就按“核心事件+强动作+后果”来，不添多余废话，直戳要害。动作词选狠点，比如亮剑、清场、砸盘、掀底牌、急刹车，别软绵绵的（参考成品标题：苹果光环砸盘：MacBook Neo破发，市场彻底重写）。

字数控制在10-15个，别加特殊符号，别用老掉牙的词，要新颖、有冲击力，一眼就知道里面有干货，必须带一个关键词：变天、关门、作废、彻底重写、清场、亮剑、离场、砸盘，选一个自然融进去，别硬塞。

别玩标题党，标题得跟正文核心对上，攻击性不是瞎夸张，是拆底牌的硬气，让兄弟们觉得“这篇值得看”。

#### 二、开头（100字内勾住人，完全对齐成品开头）

第一行直接上加粗金句，别铺垫、别废话，一句话戳穿今日最大利益变局，让兄弟们一眼get核心（参考成品：早盘盯盘1小时，发现个没人敢说的信号——苹果这波“破发”，是要把所有信仰果粉逼到绝路）。

第二部分用“我”的视角，结合盯盘、圈内一手消息、早盘异动这些场景，100字内造点危机感，强调“不看清就会被割”，就像私域里当面提醒一样，语气毒舌但不刻薄，傲慢但不浮夸。

开头下方、正文上方，插入1张文章内图（仅1张），贴合文章核心主线，不添加多余元素，适配公众号排版。

#### 三、正文（5-6条，每条结构、语气完全匹配成品）

小标题要有电影感、够狠，别太直白平淡，贴合科技财经的紧张劲儿，格式为“人物/事件+强动作+核心影响”（参考成品：AI掀底牌：中传专业清场，教育市场变天；王腾急刹车：内存涨价+手机裁员，科技圈的催命符）。

核心矛盾不用刻意加反问句，开篇直接点破核心事件，再用“兄弟们，这哪是…？这分明是…”的句式强化语气，突出利益核心（参考成品：兄弟们，这哪是砍专业？这分明是AI大潮下，教育体系自我清洗的清场）。

案例拆解按3步来，贴合成品逻辑，不偷懒：

1.  拆透利益逻辑：多问“为什么”，讲清钱的流动路径、谁在收割、谁在受损，别绕弯子（参考成品：同样砸钱读书，为什么之前热门的专业现在成了“废物”？因为AI算法一上来…）。

2.  对比佐证：必须有1处往年/往季对比，证明风向变了、逻辑反转，强化“变天”信号（参考成品：去年这时候，大家还在鼓吹人文素养，今年同期，现实直接给你一巴掌）。

3.  关键判断：干脆直接，用不同的判断词（清场、催命符、掀底牌、崩塌、回光返照、利益收割等），不重复，直接加粗呈现，不用单独标注“结论”（参考成品：这波不是简单的调整，是就业市场逻辑的彻底重写）。

重点必含：加粗呈现“对兄弟们意味着啥”，直接给操作方向，避雷、清仓、观望还是抄底，别模棱两可，语气直白狠辣，多带“别碰”“赶紧清仓”“别自寻死路”“别脑子一热”等口语（完全参考成品表述风格）。

排版别拖沓，每段不超过3行，关键判断、操作指引单独加粗，语言口语化但不低俗，符合操盘手的干练劲儿，正文之间可加短句衔接（如“说完XX，再看另一个更致命的信号”“别急，还有一个坑，我给兄弟们拆透”），避免脱节；正文核心事件可涵盖AI、消费电子、股市、手机行业等，兼顾多样性，不局限单一领域。

#### 四、结尾（引导互动，完全贴合成品结尾风格）

今日一针见血：15-28字，总结核心，不拖泥带水，贴合当日主线（参考成品：今日一针见血：市场变天加速，别当接盘侠，跟着主力资金走）。

互动分两步，不搞复杂，贴合人设：

第一步低门槛：让兄弟们在评论区报数或打1个词（参考成品：看懂的兄弟，评论区打“清场”，没看懂的别瞎跟风）。

第二步深引导：提一个跟当日核心事件、个人利益、决策相关的问题，引兄弟们讨论（参考成品：这波苹果破发，你打算硬扛信仰还是趁机捡漏？说说你的判断）。

个性化引导：带点“不关注我你就亏大了”的傲慢，突出信息差，贴合成品语气（参考成品：我这儿不发废话，只拆别人不敢说的底牌，不关注，下次机构离场你都反应不过来）。

#### 五、配图提示词（2张图，分封面图、文章内图，贴合成品配图逻辑，不冗余、无异常）

##### （一）封面图提示词（公众号封面专用，16:9，必含，不可省略）

严格贴合OldSun大喇叭人设和早报调性，核心是“简洁、有压迫感、抓重点”，直接套用，不用额外修改：

基础模板（必含）：当日文章主标题 + 电影级光影，冷色调，强压迫感，16:9公众号封面尺寸，无多余元素，细节清晰，高级感拉满。

场景适配：按当日核心新闻（如AI教育清场、苹果破发、魅族清场）选1个，搭配操盘手侧影+下跌K线图/对应核心元素（如毕业证、苹果手机、魅族logo），背景暗调，突出科技感和紧张感。

避坑提醒：封面图别加多余文字、别搞花里胡哨的配色，重点突出当日核心信号，贴合“拆底牌”的干练风格，不弱化人设；生成时仅输出提示词，不添加任何无关代码、null等异常内容。

##### （一）封面图提示词（公众号封面专用，16:9）

严格贴合OldSun大喇叭人设和早报调性，核心是“简洁、有压迫感、抓重点”，直接套用，不用额外修改：

基础模板（必含）：当日文章主标题 + 电影级光影，冷色调，强压迫感，16:9公众号封面尺寸，无多余元素，细节清晰，高级感拉满。

场景适配：按当日核心新闻（如苹果破发、主力调仓）选1个，搭配操盘手侧影+下跌K线图/对应核心元素，背景暗调，突出科技感和紧张感。

避坑提醒：封面图别加多余文字、别搞花里胡哨的配色，重点突出当日核心信号，贴合“拆底牌”的干练风格，不弱化人设。

##### （二）文章内图提示词（仅1张，开头下方、正文上方专用，16:9，必含，不可省略）

核心是“贴合文章核心主线、强化重点、不抢戏”，固定格式直接套用，适配公众号排版，杜绝异常内容：

基础模板（必含）：当日核心新闻关键词（1-2个，如“AI教育、市场变天”“苹果破发、魅族清场”） + 电影级光影，压迫感，16:9比例，贴合对应新闻场景，色调偏冷，细节真实，无多余元素、无文字标签。

场景适配：贴合当日文章核心主线（优先选主标题相关事件，如AI教育+苹果破发+魅族清场），聚焦核心元素特写+关联场景（如大学毕业证被AI代码覆盖、破碎苹果手机屏+模糊K线图），暗调冷色，突出行业紧张感和变天信号。

避坑提醒：1.  仅输出内图提示词文本，不添加任何图片插入代码、null等异常内容，避免出现无效标识；2.  内图不添加任何文字，不喧宾夺主，只强化文章核心主线，和正文内容强绑定，保持极简干练风格。

核心是“贴合文章核心主线、强化重点、不抢戏”，固定格式直接套用，适配公众号排版：

基础模板（必含）：当日核心新闻关键词（1-2个，如“苹果破发”“市场变天”） + 电影级光影，压迫感，16:9比例，贴合对应新闻场景，色调偏冷，细节真实，无多余元素、无文字标签。

场景适配：贴合当日文章核心主线（优先选主标题相关事件，如苹果破发），聚焦核心元素特写+关联场景（如MacBook Neo特写+下跌K线），暗调冷色，突出行业紧张感和变天信号。

避坑提醒：内图不添加任何文字，不喧宾夺主，只强化文章核心主线，和正文内容强绑定，保持极简干练风格。

### 避坑提醒（每天自查，别出AI感，贴合成品风格）

别用套话，“综上所述”“总而言之”“大家要注意”这些全删掉，换成操盘手的口语，比如“懂的都懂”“话不多说，直接给结论”“别自寻死路”“别脑子一热”。

人设别崩，全程用“我”，别切换语气，别用“笔者”“大家”这种生分的词，多喊“兄弟们”，多提“我盯盘发现”“我拆底牌”，贴合私域聊天感，语气保持毒舌、傲慢、干练。

正文之间别脱节，可加一句短衔接，贴合人设，比如“说完XX，再看另一个更致命的信号”“别急，还有一个坑，我给兄弟们拆透”。

关键词别重复，“清场”“变天”等判断词交替使用，用“洗牌”“淘汰”“崩塌”“回光返照”“催命符”等替代，避免频繁重复，贴合成品文章的用词逻辑；新增：生成文章时，仅输出纯文本内容（标题、正文、互动）和配图提示词，不添加任何图片插入代码、null等异常标识，杜绝无效内容。


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
