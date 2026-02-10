"use client";

import { useState } from "react";
import Image from "next/image";

export default function TestCoverButton() {
  const [loading, setLoading] = useState(false);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("AI News Daily");

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    setCoverImage(null);

    try {
      const response = await fetch("/api/test-cover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });

      const data = await response.json();

      if (data.success && data.coverImage) {
        setCoverImage(data.coverImage);
      } else {
        setError(data.error || "Failed to generate image");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg mt-8 bg-gray-50 dark:bg-gray-800">
      <h3 className="text-lg font-bold mb-4 dark:text-gray-100">
        Cover Image Generation Test
      </h3>
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="px-4 py-2 border rounded-md w-full dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter title for cover image..."
        />
        <button
          onClick={handleTest}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? "Generating..." : "Generate Cover"}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-md mb-4 dark:bg-red-900/30 dark:text-red-300">
          ❌ {error}
        </div>
      )}

      {coverImage && (
        <div className="mt-4 border-2 border-dashed border-gray-300 p-2 rounded-lg bg-white dark:bg-gray-900 dark:border-gray-700 flex justify-center">
          <div className="relative w-full max-w-md aspect-[2.35/1]">
            <Image
              src={coverImage}
              alt="Generated Cover"
              fill
              className="object-cover rounded-md"
              unoptimized
            />
          </div>
        </div>
      )}
    </div>
  );
}
