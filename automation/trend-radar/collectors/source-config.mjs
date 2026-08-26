const searchQueries = [
  { query: "viral visual trend photography social media", platform: "social_media", sourceType: "news_article" },
  { query: "AI image trend viral concept", platform: "ai_image", sourceType: "news_article" },
  { query: "Instagram photo trend aesthetic", platform: "instagram", sourceType: "trend_tracker" },
  { query: "TikTok visual meme trend", platform: "tiktok", sourceType: "trend_tracker" },
  { query: "fashion editorial visual trend", platform: "fashion_editorial", sourceType: "professional_media" },
  { query: "nostalgia photography trend", platform: "photography", sourceType: "news_article" },
  { query: "cinematic photography trend social media", platform: "photography", sourceType: "news_article" },
  { query: "advertising design image trend", platform: "advertising", sourceType: "professional_media" },
  { query: "Pinterest visual trend", platform: "pinterest", sourceType: "trend_tracker" },
  { query: "pet photo content trend", platform: "pet_content", sourceType: "news_article" }
];

const redditCommunities = [
  "midjourney",
  "generativeAI",
  "photography",
  "memes",
  "Instagram"
];

const editorialPages = [
  { url: "https://lightreel.ai/blogs/whats-trending-on-instagram", platform: "instagram", sourceType: "trend_tracker" },
  { url: "https://newengen.com/insights/instagram-trends/", platform: "instagram", sourceType: "trend_tracker" },
  { url: "https://later.com/blog/tiktok-trends/", platform: "tiktok", sourceType: "trend_tracker" },
  { url: "https://www.vogue.com/article/the-vogue-business-tiktok-trend-tracker", platform: "tiktok", sourceType: "professional_media" },
  { url: "https://business.pinterest.com/blog/pinterest-predicts-2026-turn-trends-into-unlimited-possibilities/", platform: "pinterest", sourceType: "official_report" },
  { url: "https://newsroom.pinterest.com/en-gb/news/summer-trend-report-2026/", platform: "pinterest", sourceType: "official_report" },
  { url: "https://knowyourmeme.com/memes/paparazzi-trend-paparazzi-animation-trend", platform: "meme_database", sourceType: "meme_database" }
];

export { editorialPages, redditCommunities, searchQueries };
