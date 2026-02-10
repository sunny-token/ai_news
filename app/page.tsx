"use client";
import { useState } from "react";
import "./globals.css";

// 定义API返回类型
interface GenerateResponse {
  success: boolean;
  error?: string;
  article?: string;
  hotNews?: Array<{ platform: string; title: string; url: string }>;
  date?: string;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState("");
  const [error, setError] = useState("");

  // 生成文章函数
  const generateArticle = async () => {
    setLoading(true);
    setArticle("");
    setError("");

    try {
      const res = await fetch("/api/generate");
      const data = (await res.json()) as GenerateResponse;

      if (data.success && data.article) {
        setArticle(data.article);
      } else {
        setError(data.error || "生成文章失败");
      }
    } catch (err) {
      setError("网络请求失败，请稍后重试");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 复制文章函数
  const copyArticle = async () => {
    if (!article) return;
    try {
      await navigator.clipboard.writeText(article);
      alert("文章复制成功！");
    } catch (err) {
      alert("复制失败，请手动复制");
    }
  };

  return (
    <main className="container">
      <h1 className="title">财经/科技公众号文章生成器</h1>
      <button
        className="generate-btn"
        onClick={generateArticle}
        disabled={loading}
      >
        {loading ? "生成中..." : "生成今日文章"}
      </button>

      {loading && <p className="loading">正在抓取热点并生成文章，请稍候...</p>}
      {error && <p className="error">{error}</p>}

      {article && (
        <div className="article-container">
          <pre className="article-content">{article}</pre>
          <button className="copy-btn" onClick={copyArticle}>
            复制文章
          </button>
        </div>
      )}
    </main>
  );
}
