import axios from "axios";
import FormData from "form-data";

// 微信 API 配置
const WECHAT_API_BASE = "https://api.weixin.qq.com/cgi-bin";

interface WeChatConfig {
  appId: string;
  appSecret: string;
  thumbMediaId?: string; // 封面图 Media ID (必需)
}

interface DraftArticle {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  content_source_url?: string;
  thumb_media_id: string; // 封面图 Media ID (必需)
  need_open_comment?: number;
  only_fans_can_comment?: number;
}

export class WeChatService {
  private config: WeChatConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: WeChatConfig) {
    this.config = config;
  }

  // 获取 Access Token (带简单缓存)
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now) {
      return this.accessToken;
    }

    try {
      const url = `${WECHAT_API_BASE}/token?grant_type=client_credential&appid=${this.config.appId}&secret=${this.config.appSecret}`;
      const response = await axios.get(url);

      if (response.data.errcode) {
        throw new Error(`WeChat API Error: ${response.data.errmsg}`);
      }

      this.accessToken = response.data.access_token;
      // 提前 5 分钟过期，确保安全
      this.tokenExpiresAt = now + (response.data.expires_in - 300) * 1000;
      return this.accessToken!;
    } catch (error) {
      console.error("Failed to get WeChat Access Token:", error);
      throw error;
    }
  }

  // 创建草稿 (Draft)
  // 参考文档: https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html
  async createDraft(
    article: Omit<DraftArticle, "thumb_media_id"> & { thumb_media_id?: string },
  ): Promise<string> {
    const useThumbMediaId = article.thumb_media_id || this.config.thumbMediaId;

    if (!useThumbMediaId) {
      throw new Error(
        "WeChat Thumb Media ID is not configured (WECHAT_THUMB_MEDIA_ID) and not provided.",
      );
    }

    const token = await this.getAccessToken();
    const url = `${WECHAT_API_BASE}/draft/add?access_token=${token}`;

    const draftData = {
      articles: [
        {
          ...article,
          thumb_media_id: useThumbMediaId,
        },
      ],
    };

    try {
      const response = await axios.post(url, draftData);

      if (response.data.errcode) {
        throw new Error(`WeChat Draft Error: ${response.data.errmsg}`);
      }

      console.log(
        "✅ [WeChat] Draft created successfully:",
        response.data.media_id,
      );
      return response.data.media_id; // 返回草稿的 media_id
    } catch (error) {
      console.error("Failed to create WeChat draft:", error);
      throw error;
    }
  }

  // 发布草稿 (Publish)
  // 参考文档: https://developers.weixin.qq.com/doc/offiaccount/Publish/Publish.html
  async publishDraft(mediaId: string): Promise<string> {
    const token = await this.getAccessToken();
    const url = `${WECHAT_API_BASE}/freepublish/submit?access_token=${token}`;

    const publishData = {
      media_id: mediaId,
    };

    try {
      const response = await axios.post(url, publishData);

      if (response.data.errcode) {
        throw new Error(`WeChat Publish Error: ${response.data.errmsg}`);
      }

      console.log(
        "✅ [WeChat] Draft published successfully. Main Message ID:",
        response.data.msg_id,
      );
      return response.data.publish_id || String(response.data.msg_id);
    } catch (error) {
      console.error("Failed to publish WeChat draft:", error);
      throw error;
    }
  }

  // 辅助函数：将纯文本转换为简单的 HTML 格式
  formatContentToHtml(content: string): string {
    return `
      <section style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', Arial, sans-serif; font-size: 16px;">
        <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: inherit;">${content}</pre>
      </section>
    `;
  }

  // 上传图片（永久素材，用于封面）
  // source: 可以是 URL (http开头)、Base64 字符串 或 Buffer
  async uploadThumb(source: string | Buffer): Promise<string> {
    const token = await this.getAccessToken();

    try {
      let imageBuffer: Buffer;

      if (Buffer.isBuffer(source)) {
        imageBuffer = source;
      } else if (typeof source === "string") {
        if (source.startsWith("http") || source.startsWith("https")) {
          // 1. 是 URL -> 下载
          const imageResponse = await axios.get(source, {
            responseType: "arraybuffer",
            timeout: 10000,
          });
          imageBuffer = Buffer.from(imageResponse.data);
        } else {
          // 2. 是 Base64 字符串 (假设无DataURL前缀，如有需清理)
          const base64Data = source.replace(/^data:image\/\w+;base64,/, "");
          imageBuffer = Buffer.from(base64Data, "base64");
        }
      } else {
        throw new Error(
          "Invalid image source. Must be URL string, Base64 string, or Buffer.",
        );
      }

      // 3. 构造表单
      const formData = new FormData();
      formData.append("media", imageBuffer, {
        filename: "cover.jpg",
        contentType: "image/jpeg",
      });

      // 4. 上传 (永久素材: material/add_material)
      const uploadUrl = `${WECHAT_API_BASE}/material/add_material?access_token=${token}&type=image`;

      const response = await axios.post(uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
      });

      if (response.data.errcode) {
        throw new Error(`WeChat Upload Error: ${response.data.errmsg}`);
      }

      console.log(
        "✅ [WeChat] Image uploaded successfully:",
        response.data.media_id,
      );
      return response.data.media_id;
    } catch (error) {
      console.error("Failed to upload image to WeChat:", error);
      throw error;
    }
  }
}

// 导出单例或工厂函数
export const getWeChatService = () => {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  const thumbMediaId = process.env.WECHAT_THUMB_MEDIA_ID;

  if (!appId || !appSecret) {
    console.warn(
      "⚠️ [WeChat] Missing APP_ID or APP_SECRET in environment variables.",
    );
    return null;
  }

  return new WeChatService({ appId, appSecret, thumbMediaId });
};
