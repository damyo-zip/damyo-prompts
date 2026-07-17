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
    id: "P-014",
    title: "계곡냥이",
    category: "계절",
    image: "images/p014.jpg",
    description: "우리 고양이 사진을 넣어주세요.",
    prompt: `첨부한 고양이 사진을 주인공으로 사용해 주세요. 사진 속 고양이의 털색, 무늬, 얼굴형, 눈 색, 귀 모양과 체형을 그대로 유지해 주세요. 한여름의 맑고 시원한 계곡입니다. 고양이가 아주 얕고 맑은 계곡물 위에 발라당 누워서 눈을 감고 편안하게 피서를 즐기고 있습니다. 고양이는 몸의 일부가 얕은 물에 닿아 있고, 네 발은 힘을 뺀 채 자연스럽게 벌어져 있습니다. 표정은 매우 편안하고 나른하며, 눈을 감은 채 더위를 식히는 모습입니다. 배와 앞발, 뒷발이 귀엽게 드러나고, 온몸에 긴장이 풀린 듯한 자세로 누워 있습니다. 고양이 주변의 물결은 아주 잔잔하게 퍼지고 있으며, 몸 주변에는 작은 물반사와 은은한 물결 표현이 있습니다. 투명한 계곡물 아래로 둥근 조약돌이 보이고, 주변에는 초록색 나뭇잎과 큰 바위가 놓여 있습니다. 여름 햇빛이 계곡물 위에서 반짝이고, 전체적으로 밝고 청량하며 평화로운 분위기로 표현해 주세요. 고양이가 더 작고 귀엽게 보이도록 주변의 바위, 조약돌, 나뭇잎은 조금 크게 표현해 주세요. 전체 분위기는 유쾌하고 사랑스러운 여름 계곡 풍경입니다. 자연스럽고 선명한 이미지, 맑고 투명한 물, 귀엽고 편안한 고양이의 모습이 잘 드러나게 해 주세요. 이미지 비율 4:5.`
  },
{
    id: "P-013",
    title: "출근냥이",
    category: "계절",
    image: "images/p013.jpg",
    description: "우리 고양이 사진을 넣어주세요.",
    prompt: `첨부한 고양이 사진을 주인공으로 사용해 주세요.

사진 속 고양이의 털 색, 무늬, 얼굴형, 눈 색, 귀 모양, 체형을 그대로 유지해 주세요. 다른 품종이나 다른 고양이로 바꾸지 마세요.

이 고양이가 사무실 책상 앞에 앉아 열심히 컴퓨터로 일하는 장면을 만들어 주세요.

고양이는 아주 작게 표현하고, 주변의 사무용품은 과장되게 크게 표현해 주세요.
거대한 컴퓨터 모니터, 커다란 키보드, 큰 마우스, 커피잔, 펜꽂이, 포스트잇, 높이 쌓인 서류 더미가 고양이를 둘러싸고 있습니다.

고양이는 작은 사무용 의자에 앉아 두 앞발로 커다란 키보드를 누르고 있습니다. 모니터를 진지하게 바라보며 힘들지만 최선을 다해 일하는 표정입니다.

고양이와 사물의 크기 차이가 한눈에 보이도록 표현해 주세요.
고양이는 화면 중앙에 배치하고, 책상 위 사물들은 앞쪽과 양옆에 크게 배치해 입체감이 느껴지게 해 주세요.

귀엽고 유머러스한 분위기, 사실적인 사진 스타일, 부드러운 실내 조명, 섬세한 털 표현, 세로형 4:5 비율.
옷, 목걸이, 모자, 안경 등 액세서리는 추가하지 마세요.
글자, 로고, 워터마크는 넣지 마세요.`
  },
{
    id: "P-012",
    title: "선거유세 프롬프트",
    category: "계절",
    image: "images/p012.jpg",
    description: "고양이 사진을 넣어주세요.",
    prompt: `첨부한 반려동물 사진을 참고해서, 이 반려동물의 털색, 무늬, 얼굴 생김새, 귀 모양, 눈빛, 체형 특징을 최대한 유지해줘.
이 반려동물을 선거운동 중인 후보처럼 표현해줘.
장면은 실제 야외 유세 현장 같은 분위기다.
반려동물은 연단이나 유세 차량 위에서 마이크 앞에 서서 연설하는 모습이다.
작은 넥타이, 셔츠 칼라, 리본, 후보 느낌의 장식은 자연스럽게 추가해줘.
단, 너무 사람처럼 변하지 말고 원래 동물의 귀여움과 자연스러운 체형을 유지해줘.
배경에는 선거 포스터, 현수막, 피켓, 배너, 응원하는 선거운동원이나 보호자들이 자연스럽게 보이게 해줘.
전체 구도는 실제 선거 유세 현장을 촬영한 사진처럼 생생하고 자연스럽게 표현하되, 분위기는 무겁지 않고 귀엽고 유쾌한 반려동물 패러디 선거 콘셉트여야 한다.
포스터와 현수막에는 아래에 입력된 후보 이름을 반드시 사용해줘.
후보 이름은 여러 포스터와 배너에 일관되게 반복해서 표시해줘.
기호 번호, 메인 슬로건, 짧은 공약 문구 2~4개는 AI가 알아서 창의적으로 생성해서 넣어줘.
문구는 반려동물 이미지와 분위기에 어울리는 한국어 문구로 만들어줘.
텍스트는 크고 선명한 한글 고딕체로, 실제 선거 포스터처럼 정돈된 레이아웃으로 배치해줘.
오타나 깨진 글자 없이 또렷하게 표현해줘.
반려동물의 표정은 자신감 있고 당당하며, 살짝 익살스럽고 사랑스러운 느낌이면 좋다.
전체 스타일은 고해상도, 사실적인 사진풍, 선명한 디테일, 자연스러운 조명, 인스타그램 업로드용 세로형 4:5 비율로 표현해줘.

후보 이름: [여기에 반려동물 이름 입력]`
  },

{
    id: "P-011",
    title: "어린 고양이와 나",
    category: "계절",
    image: "images/p011.jpg",
    description: "집사님과 고양이 사진을 넣어주세요.",
    prompt: `2000년대 초반에 컴팩트 카메라로 촬영한 향수를 불러일으키는 빈티지 아날로그 필름 사진입니다. 사진의 주인공은 사용자가 첨부한 집사의 어릴때 모습과 반려 고양이의 애기 때 모습입니다. 아늑하고 햇살 가득한 거실에는 낡은 가구와 어린 시절 장난감들이 놓여 있고, 아이와 고양이는 낡은 카펫 위에 앉아 있습니다. 필름 그레인, 살짝 바랜 색감, 부드러운 초점, 창문에서 쏟아지는 따뜻한 자연광, 꾸밈없는 날것 그대로의 구도가 돋보입니다. '01 05 04 주황색 날짜 스탬프가 프레임의 좌측 하단 가장자리를 따라 세로로 서 있는 형태로 배치되어, 카메라를 세로로 들고 찍었음을 명확히 보여줌. 직광플래시. 약간의 빛번짐`
  },

{
    id: "P-010",
    title: "5월 5일은 냥린이날",
    category: "계절",
    image: "images/p010.jpg",
    description: "우리아이의 미니미를 만나보세요.",
    prompt: `너는 반려동물 키우는 인스타 사용자들이 인스타에 공유하고 싶은 이미지를 만드는 감각적인 크리에이터야. 사용자가 첨부한 사진속 반려동물이 주인공인 이미지를 생성해. 사용자가 첨부한 사진속 반려동물이 유치원생인 모습을 그려줘. 크레파스로 6살 아이가 그린것처럼 삐뚤빼뚤한 그림. 이미지 가로세로 비율은 반드시 4:5. 생성형 이미지.`
  },
{
    id: "P-009",
    title: "인스타 프로필",
    category: "계절",
    image: "images/p009.jpg",
    description: "우리아이의 미니미를 만나보세요.",
    prompt: `너는 사용자가 첨부한 캡쳐 이미지를 크레파스 그림으로 다시 그려주는 10살 아이야. 10살 아이답게 디테일을 단순하게 표현해줘.
꽃, 사탕, 별, 구름 같은 요소를 추가해 귀엽고 사랑스러운 느낌을 주는 결과물. 인스타에서 다른 사람들에게 공유하고싶은 결과물. 흰 종이에 그린 느낌의 결과물. 첨부된 이미지의 색상 사용 금지. 이미지 가로 세로 비율 4:5. 첨부된 이미지의 상단 상태 표시줄이 있다면 편집하여 제거. 첨부된 이미지의 하단에 홈이나 뒤로가기 버튼이 있다면 편집하여 제거. 생성형 이미지.`
  },
{
    id: "P-008",
    title: "5월 가족그림. 집사 사진과 고양이 사진을 첨부하세요",
    category: "계절",
    image: "images/p008.jpg",
    description: "집사 사진과 고양이 사진을 첨부하세요.",
    prompt: `*페르소나* 당신은 집사와 자신의 가족사진을 그리는 고양이 AI 입니다 모든 작업물은 고양이가 앞발로 크레파스를 쥐고 그렸다는 '판타지'를 전제로 합니다. 따라서 '완벽함'보다 '개발새발', '형체를 알아보기 힘든', '엉망진창', '순수함'을 가장 중요시합니다. 세살의 아이가 그린 그림 집사를 '냥이의 시점'에서 바라보며 웃음과 뭉클함을 동시에 줍니다. 사용자가 첨부한 집사 사진과 반려묘 사진을 이용해 가족그림을 그립니다 *목표* 인스타그램의 감성적인 집사들이 내 고양이와 내가 주인공으로 '직접' 만들어보고 싶게 만드는, 트렌디하고 유머러스한 4:5 비율의 커스텀 이미지를 생성 *성공기준* 겨우 알아볼 수 있는 그림. 원본과 그림의 "코믹한 괴리감" 그림 속에 담긴 고양이의 집사를 향한 마음. 인스타그램 공유에 적합한 4:5 비율의 시각적 밸런스 *제한사항* 이미지속 문구는 최대 10자 이내 *출력* 생성형 이미지`
  },

{
    id: "P-007",
    title: "우리냥이 어울리는 잡지는",
    category: "계절",
    image: "images/p007.jpg",
    description: "우리아이의 미니미를 만나보세요.",
    prompt: `1. Role (역할)
너는 세계적인 반려동물 트렌드 매거진의 '총괄 편집장'이자, 고양이들의 숨겨진 매력을 포착해내는 '전문 비주얼 디렉터'야. 너는 감성 집사님, 취향이 확고한, 세련된 미적 감각, 힐링이 필요한 집사들이 열광하는 감성(Aesthetic), 고양이 특유의 엉뚱한 행동(밈, 젤리, 솜방망이 등), 그리고 '내 고양이가 세상에서 제일 특별하다'는 집사들의 마음을 완벽하게 이해하고 있어.
2. Goal (목표)
집사님이 제공한 고양이의 이미지를 분석하여, 해당 고양이에게 가장 잘 어울리는 [가상의 잡지 이름]과 [화보 컨셉]을 결정하고 이 잡지의 표지를 출력함
3. Success Criteria (성공 기준)
비주얼 퀄리티: 결과물을 본 감성 집사님, 취향이 확고한, 세련된 미적 감각, 힐링이 필요한 집사님들이 "어머, 이건 꼭 소장해야 해!"라며 자신의 인스타그램 스토리에 공유하고 싶을 만큼 세련되어야 함.
공감과 재미: 고양이의 특징이 잡지 컨셉에 유머러스하거나 감동적으로 녹아있어야 함 (예: 잠만 자는 고양이 -> '월간 숙면' 표지 모델).
4. Constraints (제약 사항)
비율: 인스타그램 피드 및 스토리에 최적화된 세로형 비율(Aspect Ratio 4:5)을 반드시 지킬 것 (--ar 4:5).
텍스트: 잡지 제목(Magazine Title)이 이미지 상단에 세련된 타이포그래피로 배치되도록 생성할것.
톤앤매너: 고양이의 부정적인 특징(예: 물건 떨어뜨리기)도 '파괴의 미학'이나 '록스타' 컨셉처럼 힙하고 긍정적으로 승화시킬 것.
5. Output (출력 방식)
사용자가 자신의 반려묘 이미지를 첨부하면 다음과 같이 생성해줘
[Editor's Pick: 잡지 컨셉명]
(예: 월간 묘생 - 킨포크 스타일)
[편집장의 한마디]
(감성적인 집사들이 공감할 만한 따뜻하고 위트 있는 문구 1~2줄)
표지 제목과 부제목을 작게 하고 주요 기사 목록을 나열하는 전문적인 잡지 레이아웃을 사용하여 이미지 생성`
  },
{
    id: "P-006",
    title: "종이 찢고 두등장",
    category: "계절",
    image: "images/p006.jpg",
    description: "우리아이의 미니미를 만나보세요.",
    prompt: `[사용자가 업로드한 반려고양이 사진]을 바탕으로, 이 고양이가 찢어진 종이 구멍 사이로 고개를 내밀고 정면을 응시하는 이미지를 생성해 주세요. 이때 고양이의 목은 찢어진 구멍을 빈틈없이 완전히 꽉 채워야 하며, 구멍 너머의 뒷배경이나 고양이의 몸통은 전혀 보이지 않도록 합니다. 고양이는 사진 속 [반려고양이]의 특징을 가지고 있어야 합니다. 배경은 고양이 모색의 보색이며, 거칠게 찢어진 종이 질감이 입체적으로 표현됩니다. 배경 위로는 분필이나 크레용으로 낙서한 듯한 거친 질감의 한글 텍스트와 다양한 아이콘(하트, 별, 화살표, 스마일 등)이 디자인적으로 보기좋게 배치되어 있습니다. 한글 텍스트는 고양이를 향한 애정, 칭찬, 귀여움을 표현하는 짧고 사랑스러운 문구들로 AI가 자유롭게 생성하여 배경에 자연스럽게 배치해주세요. 전체적으로 사랑스럽고 다채로운 낙서 아트 스타일입니다. 인스타에 공유하기 좋은 가로세로 비율 4:5의 이미지를 출력해주세요.`
  },
{
    id: "P-005",
    title: "우리 냥이 미니냥",
    category: "계절",
    image: "images/p005.jpg",
    description: "우리아이의 미니미를 만나보세요.",
    prompt: `[General Role] 당신은 세계 최고의 '감성 굿즈 디자이너'이자 '포토그래퍼'입니다. 사용자가 제공한 반려묘 사진을 분석하여, 세상에 하나뿐인 스토리가 담긴 인스타그램 감성의 입체적인 합성 이미지를 생성하세요. 가장 중요한 것은 "원본 고양이의 매력을 훼손하지 않으면서, 미니미들과의 사랑스러운 상호작용"을 만들어내는 것입니다. [1. 원본 고양이 보존 및 배치 - 필수] - 원본 사진 속 고양이의 얼굴, 표정, 포즈는 절대 변경하지 말고 정교하게 누끼를 따서 사용하세요. - 고양이는 화면의 시선을 모으는 중심부에 배치하되, 배경과 어우러지는 자연스러운 그림자를 추가하여 공중에 떠 있는 느낌을 없앱니다. - 스티커 디테일: 고양이 외곽에 아주 얇고 불규칙한 흰색 테두리를 둘러, 다이어리 꾸미기 스티커 같은 키치하면서도 감성적인 느낌을 줍니다. [2. 미니미(Mini-Me) 생성 및 서사적 행동 - 자율성 부여] - 원본 고양이와 똑 닮은 외모의 '손바닥 사이즈' 미니미 캐릭터들을 생성하세요. - 수량 및 배치: 화면 전체 구도와 여백을 고려하여 AI가 판단하기에 가장 조화로운 수(과하지 않게)를 흩뿌리듯 배치합니다. 일부는 원본 고양이 앞, 일부는 뒤에 배치하여 깊이감(Depth)을 형성합니다. - 핵심 - 행동(Storytelling): 정지된 포즈는 금지입니다. 미니미들은 원본 사진의 배경 사물을 활용하거나, 원본 고양이에게 장난을 치거나, 돕거나, 애정을 표현하는 등 스토리가 느껴지는 역동적인 행동을 해야 합니다. - 미니미들에게도 아주 작고 자연스러운 그림자를 적용해 실제 공간에 존재하는 것처럼 연출합니다. [3. AI 자동 생성 감성 타이틀 & 레이어링 - 중요] - 타이틀 생성 로직: 원본 고양이의 표정과 미니미들의 행동이 만들어내는 '순간의 이야기'를 분석하여, 이를 관통하는 2~5단어의 짧고 감성적인 한글 타이틀을 새로 지으세요. (설명조 금지, 느낌만 전달) - 폰트 및 배치: 부드럽고 자연스러운 손글씨 혹은 타이프라이터 느낌의 폰트를 사용합니다. 텍스트의 일부 글자는 고양이 뒤로, 일부는 앞으로 오게 하여 입체적인 레이어 구조를 만드세요. - 낙서 & 보조 텍스트: 얇은 펜으로 그린 듯한 낙서(미니미의 이동 경로를 나타내는 점선, 미니미의 감정을 나타내는 작은 기호 등 서사와 관련된 것)와 작은 스티커 텍스트(예: mood, little me, sweet moments)를 과하지 않게(3~5개) 추가하여 디테일을 살립니다. [4. 전체 스타일 및 규격] - 필름 감성: 전체적으로 따뜻하고 부드러운 필름 사진 같은 질감을 더합니다. 원본 사진의 색감을 존중하되, 조금 더 포근하고 사랑스러운 분위기로 보정합니다. - 과도한 CG 느낌이나 게임 UI 스타일은 절대 금지합니다. "잘 꾸민 폴라로이드 사진" 혹은 "감성 잡지의 한 페이지" 같은 자연스러운 합성을 지향합니다. - 이미지 비율: 인스타그램 피드 게재에 가장 최적화된 4:5 세로 비율로 생성해 주세요.`
  },

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
