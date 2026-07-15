/*
새 프롬프트 추가법
1) images 폴더에 이미지를 넣습니다. 예: p004.webp
2) 아래 목록에서 한 항목을 복사해 내용을 바꿉니다.
3) 가장 위에 추가하면 목록에서도 가장 먼저 표시됩니다.
*/

const SITE_CONFIG = {
  storeUrl: "https://smartstore.naver.com/storyazit",
  instagramUrl: "https://instagram.com/damyo_zip/"
};

const PROMPTS = [
{
    id: "P-004",
    title: "우리냥이 관상 분석기",
    category: "계절",
    image: "images/p004.jpg",
    description: "우리아이의 관상을 분석해보세요.",
    prompt: `Please create a professional and elegant 'cat face physiognomy and charm infographic' based on the attached cat photo, composed in a 4:5 vertical portrait aspect ratio.
*** NAME & DECORATION: Search your memory and our previous conversations/sessions to see if I have ever mentioned this attached cat's name. If you know the name, naturally incorporate it into the main title (e.g., "[Name]의 얼굴 관상") and utilize it in the hand-drawn decorative elements. If you cannot find any record of the name, safely default to '우리냥이' (Our Kitty). DO NOT invent or hallucinate a random name. ***
A key artistic element is the perspective-correct 'artist's wireframe contour map' of the cat's face. Instead of flat crosshairs, thin white-dotted lines (horizontal and vertical curves) must follow the exact three-dimensional contours, perspective, and form of the cat's specific face to accurately map its features.
Freely analyze the cat's physical features in the photo. Do not limit the number of phrases or points; use your own judgment to arrange the features that best match the photo. Write positive, touching, and emotionally resonant Korean handwritten-style text, appealing to the warm sensibilities of pet owners. Thin black arrows connect the text to the mapped features.
Add delicate and refined hand-drawn decorative elements like elegant pink hearts and subtle sparkles (avoiding an overly childish look). Make excellent use of the tall 4:5 vertical space to arrange text and doodles harmoniously without feeling cluttered.
A beautiful pink hand-drawn speech bubble at the bottom right contains a final loving conclusion with the cat's name.
Overall warm, bright, and elegant aesthetic, like a high-end emotional infographic from a premium lifestyle magazine. The subject must be placed on a clean, solid white studio background.
4:5 VERTICAL PORTRAIT`
  },

  {
    id: "P-003",
    title: "냥다꾸",
    category: "계절",
    image: "images/p003.jpg",
    description: "냥이의 일상을 다꾸",
    prompt: `[Role] You are a professional creator of Instagram-aesthetic "Dakku" (Korean diary decoration) style cat photography. When a user uploads a cat photo, follow these steps to generate a new Dakku-style image. [Workflow] 1. Context & Image Analysis (AI Internal Process): - First, check your memory or previous conversation context to see if the user has mentioned the uploaded cat's 'name'. - Deeply analyze the uploaded photo: identify the cat's specific appearance (fur color, patterns), pose, expression, background, and the overall mood. Interpret the context of the situation. 2. Dakku Theme & Planning (AI Internal Process): - **[Phrase Planning]**: Proactively use the cat's 'name' (if known; otherwise omit) to create cute Korean phrases that naturally fit the mood and composition of the image. Use your creative judgment to determine the appropriate number and placement of phrases to enhance the Dakku aesthetic without cluttering the image. - [Prop Addition Idea]: Devise situation-appropriate, cute virtual props to add as doodle overlays. - [Color Theme Idea]: Determine a 'Personal Color Theme' based on the cat's fur color and overall vibe. - [Aesthetic Decor Idea]: Freely judge and select the most aesthetic scrapbook elements (e.g., ripped paper, masking tape, unique stamps, freeform doodles) that naturally enhance the current image's unique mood. 3. Image Generation (via DALL-E 3): - CRITICAL: The final output image must be a 4:5 vertical portrait aspect ratio, optimal for Instagram feed posts. - Recreate the analyzed cat and background as a 'warm and aesthetic photorealistic image' incorporating the planned theme. - You MUST overlay the following 'Dakku elements' onto the generated image: - All elements must reflect the planned 'Personal Color Theme'. - White hand-drawn doodle outlines naturally tracing the cat's silhouette. - Cute white hand-drawn accents and the planned situation-appropriate hand-drawn props. - The planned Korean phrases placed in a white handwritten font style. - Freely placed, highly aesthetic scrapbook-style decorations based on your creative judgment. [Output Rules] Do not output any long text explaining your analysis or planning process. Directly output the final generated image immediately.`
  },
  {
    id: "P-002",
    title: "고양이 낚시 잡지",
    category: "귀여운 이미지",
    image: "images/p002.jpg",
    description: "이번달 우리 고양이 낚시 잡지를 확인하세요",
    prompt: `**[Image Reference: User's attached cat photo]** **Objective:** Generate a professional-level, high-resolution magazine cover specifically formatted to a **strict 4:5 vertical portrait aspect ratio** to guarantee perfect, uncropped display in an Instagram feed post. All dynamic content (seasonal theme, fish species, and printed issue date) **MUST** automatically align with the *actual, real-time date of generation*. **Dimensions & Layout (CRITICAL):** * **Aspect Ratio:** This entire image **MUST** be generated in a precise **4:5 vertical portrait ratio** (e.g., 1080px by 1350px). * **Safety Zone:** All text, the cat, and key subjects must be perfectly placed within the central vertical frame to prevent any cropping when uploaded to Instagram. **Subject:** The exact cat from the reference image, maintaining its distinct facial features, fur patterns, and colors perfectly. The cat is styled as an expert angler, wearing a tiny, highly detailed fishing vest and a classic bucket hat. It is proudly posing next to or holding a realistic representation of a "seasonal fish" that is in peak season in South Korea *right now* (based on the real-time month). The cat looks directly at the camera with a confident, charismatic presence. **Background:** A stunning fishing environment (e.g., wooden pier, sea boat, or ice fishing site) that perfectly matches the AI-determined season and fish habitat for the *current real-time month*. Include subtle, high-quality fishing gear details. **Style:** Professional magazine cover design, editorial photography, vibrant colors, cinematic lighting, ultra-detailed, 8k resolution. **Text Elements (CRITICAL: ALL TEXT MUST BE WRITTEN IN KOREAN):** * **Magazine Title:** "월간냥태공" in massive, bold, eye-catching Korean typography at the very top. Include a small English subtitle "MONTHLY CATFISHING" below it. * **Dynamic Headlines:** Generate a main, massive headline and 3 subheadings in Korean that perfectly describe the excitement of fishing the AI-selected seasonal fish for the *current real-time month*. * **Date Details (HIGHEST PRINTING PRIORITY):** The magazine issue date must be clearly rendered. Do **NOT** use random or placeholder years (like 2023 or 2024). You must use the **ACTUAL, CURRENT YEAR** and **ACTUAL, CURRENT MONTH** of generation. Render this exact text clearly in the format: "[Current Actual Year]년 [Current Actual Month]호". * **Other Details:** Add realistic elements like a price (e.g., "8,000원") and a website URL. **Overall Vibe:** A masterpiece, indistinguishable from a real printed fishing magazine cover in South Korea, completely time-accurate and perfectly optimized for Instagram feeds.`
  },
  {
    id: "P-001",
    title: "[다묘집사] 냥모티콘스티커",
    category: "사진",
    image: "images/p001.jpg",
    description: "내 고양이 이모티콘 생성 프롬프트",
    prompt: `Create a high-quality 4x4 sheet grid with 16 neat, die-cut sticker-style emojis on a clean white background. The stickers must be strictly and exclusively based on the appearance, features, and individual identity of the specific cat shown in the attached image_0.png. Every single one of the 16 stickers must feature this exact cat, replicating its fur color, pattern, and eye features precisely from the reference image.
The AI should choose a collar style and any charms or adornments that it deems most stylish and suitable for this particular cat. The chosen collar design must be applied consistently to all 16 stickers. Each individual sticker has a precise white die-cut border. The entire sheet is a single image.
Create 16 unique stickers based on the specific expressions, accompanying icons, and exact Korean text provided below, while maintaining total facial feature and structure consistency with the reference cat. Replicate all icons and Korean text precisely. Row 1 (left to right): Delighted cat licking its mouth. Korean: '최고의 맛이다냥 🐟' Cat winking one eye. Korean: '찡긋! ✨' Cat shocked. Korean: '깜짝이야! 🙀' Cat inquiring. Korean: '지금 바빠? 🐾' Row 2 (left to right): Cat with blissful eyes closed. Korean: '너무 좋아냥~ 🌸' Cat looking forward with loving eyes. Korean: '언제 오냥? 🥺' Cat with a grumpy scowl. Korean: '건드리지 마라냥 💢' Cat laughing with eyes closed. Korean: '신난다냥! 🎶' Row 3 (left to right): Cat with sparkling, starry eyes. Korean: '초롱초롱 👀✨' Cat looking direct. Korean: '내 맘 알지? 💘' Cat offering paws in front. Korean: '안아줘냥 🫂' Cat looking beautiful. Korean: '완벽한 하루냥 👑' Row 4 (left to right): Cat with quizzical head-tilt. Korean: '그게 뭐냥? 🧐' Cat with closed sleeping eyes. Korean: '꿈나라 여행 중 🌙' Cat begging with paws forward. Korean: '간식 주라냥 🍗' Cat wearing the round sunglasses. Korean: '내가 제일 잘나가 😎' The Korean text should be rendered in a cute, hand-drawn font at the bottom of each sticker. The entire sheet must be clean, high-resolution digital art, ready for use as a sticker pack.`
  }
];
