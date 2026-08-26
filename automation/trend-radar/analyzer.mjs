import { createHash } from "node:crypto";
import { keywordsFromText } from "./collectors/candidate-parser.mjs";

const conceptRules = [
  {
    key: "retro-direct-flash-dump",
    patterns: [/retro.{0,20}(flash|digital|digicam)/i, /direct flash/i, /digital.camera/i, /polaroid/i, /y2k travel/i, /g7x/i],
    title: "Retro Direct-Flash Pet Dump",
    description: "강한 직광, 거친 입자, 불완전한 노출로 만든 초기 디지털카메라풍 생활 사진 모음",
    adaptation: "반려동물이 밤 외출 중 우연히 찍힌 듯한 2000년대 디카 직광 스냅",
    scores: [96, 94, 97, 95],
    fits: [96, 94, 92]
  },
  {
    key: "scrapbook-carousel",
    patterns: [/scrapbook/i, /carousel.{0,20}(magazine|journal|collage)/i, /mini magazine/i],
    title: "Pet Scrapbook Mini-Magazine",
    description: "사진, 스티커, 메모, 종이 질감을 한 화면에 겹친 미니 잡지형 스크랩북",
    adaptation: "반려동물의 하루를 손으로 만든 여행 저널이나 미니 잡지 한 페이지처럼 구성",
    scores: [93, 94, 88, 84],
    fits: [94, 93, 96]
  },
  {
    key: "august-photo-grid",
    patterns: [/august.{0,20}(photo dump|six.pic|recap|grid|add yours)/i, /six pics of august/i],
    title: "Late-Summer Pet Photo Grid",
    description: "늦여름의 순간을 6~12장 그리드나 사진 덤프로 묶는 참여형 월간 회고 포맷",
    adaptation: "한 장의 반려동물 사진을 늦여름 하루의 다양한 순간처럼 변주한 6컷 기록",
    scores: [94, 91, 84, 82],
    fits: [92, 92, 92]
  },
  {
    key: "documentary-confession",
    patterns: [/documentary.{0,20}meme/i, /confess/i, /subtitle.style/i, /real.{0,10}unposed.photo/i],
    title: "Documentary Pet Confession",
    description: "꾸미지 않은 일상 스냅에 다큐멘터리 자막 같은 솔직한 고백을 얹는 밈",
    adaptation: "간식이나 산책에 집착하는 반려동물의 무심한 폰카 장면을 다큐 스틸처럼 연출",
    scores: [95, 97, 91, 98],
    fits: [97, 97, 98]
  },
  {
    key: "paparazzi-chaos",
    patterns: [/paparazzi/i, /behind.the.scenes.{0,20}(shoot|photo)/i],
    title: "Paparazzi Pet Arrival",
    description: "플래시와 취재진에 둘러싸인 스타의 도착 장면을 과장한 파파라치 시점",
    adaptation: "반려동물이 레드카펫에 도착해 수십 개 카메라 플래시를 받는 순간",
    scores: [96, 98, 99, 91],
    fits: [98, 98, 99]
  },
  {
    key: "color-hunt",
    patterns: [/color hunt/i, /colour hunt/i, /specific hues/i],
    title: "Pet Color-Hunt Portrait",
    description: "한 가지 색을 도시에서 찾아 프레임 전체의 색 조합을 맞추는 사진 놀이",
    adaptation: "반려동물의 목줄이나 털색과 같은 색의 거리 사물 사이에서 찍은 컬러 헌트 초상",
    scores: [91, 89, 95, 88],
    fits: [92, 91, 86]
  },
  {
    key: "glitchy-glam",
    patterns: [/glitchy glam/i, /mismatched.{0,15}(glam|makeup|nail)/i, /avant.garde makeup/i],
    title: "Glitchy Glam Pet Editorial",
    description: "비대칭 장식, 충돌하는 색과 의도적인 불완전함을 살린 실험적 뷰티 화보",
    adaptation: "털을 훼손하지 않는 컬러 조명과 비대칭 액세서리로 만든 반려동물 글리치 화보",
    scores: [92, 90, 99, 83],
    fits: [92, 94, 95]
  },
  {
    key: "y2k-bedazzled",
    patterns: [/body gem/i, /bedazzl/i, /belly chain/i, /rhinestone/i, /y2k.{0,20}(gem|bling|spark|obsession)/i],
    title: "Y2K Bedazzled Pet Portrait",
    description: "2000년대식 보석 스티커, 크롬 소품, 반짝이는 플래시를 활용한 Y2K 초상",
    adaptation: "반려동물 주변 소품과 이름표를 보석처럼 반짝이게 한 Y2K 스타 사진",
    scores: [92, 93, 97, 92],
    fits: [94, 95, 98]
  },
  {
    key: "glamoratti-power",
    patterns: [/glamoratti/i, /power dressing/i, /sculpted shoulder/i, /chunky.{0,10}(gold|accessor)/i],
    title: "Glamoratti Pet Power Portrait",
    description: "조각 같은 어깨선, 대담한 금빛 장식과 1980년대 권력 화보를 결합한 맥시멀리즘",
    adaptation: "반려동물을 거대한 골드 액세서리와 파워 수트를 갖춘 80년대 거물처럼 촬영",
    scores: [90, 96, 99, 91],
    fits: [97, 97, 99]
  },
  {
    key: "cool-blue-glacier",
    patterns: [/cool blue/i, /icy blue/i, /glacier aesthetic/i],
    title: "Cool-Blue Glacier Pet",
    description: "빙하색 블루, 투명 소재와 차가운 반사광으로 만드는 몽환적 패션 이미지",
    adaptation: "반려동물을 얼음 궁전의 주인공처럼 표현하되 털색은 그대로 유지한 쿨블루 화보",
    scores: [89, 91, 96, 92],
    fits: [94, 94, 96]
  },
  {
    key: "throwback-childhood",
    patterns: [/throwback kid/i, /2016.{0,20}(new|throwback|nostalgia)/i, /childhood nostalgia/i, /retro toy/i],
    title: "Pet Childhood Throwback",
    description: "빈티지 장난감, 원색, 오래된 가족앨범 구도로 어린 시절의 향수를 재구성",
    adaptation: "반려동물을 1990~2000년대 가족사진 속 어린아이처럼 장난감과 함께 촬영",
    scores: [91, 98, 94, 96],
    fits: [98, 98, 99]
  },
  {
    key: "niche-costume",
    patterns: [/niche halloween costume/i, /halloween.{0,20}(cosplay|inspiration|costume)/i],
    title: "Niche Character Pet Costume",
    description: "유명 캐릭터보다 알아보는 사람이 반가운 영화·패션 순간을 골라 재현하는 코스튬",
    adaptation: "반려동물에게 안전한 소품만 더해 컬트 영화의 한 장면이나 런웨이 룩을 재현",
    scores: [92, 94, 96, 88],
    fits: [95, 95, 97]
  },
  {
    key: "dark-balletcore",
    patterns: [/balletcore/i, /black swan/i, /actual dancer/i],
    title: "Dark Ballet Pet Backstage",
    description: "분홍 발레 미학 대신 땀, 연습실, 검은 튤과 무대 뒤 긴장감을 강조한 발레코어",
    adaptation: "반려동물을 공연 직전 무대 뒤 작은 발레 스타처럼 영화적으로 포착",
    scores: [91, 93, 97, 89],
    fits: [94, 95, 98]
  },
  {
    key: "clone-crowd",
    patterns: [/clone/i, /duplicate.{0,20}(people|person|crowd|character)/i, /same.{0,10}(person|character).{0,20}(many|crowd)/i],
    title: "Clone Pet Crowd",
    description: "동일한 주인공이 수십 번 복제되어 화면 전체를 채우는 초현실적 군중 이미지",
    adaptation: "같은 반려동물 30마리가 한 마리의 주인공을 둘러싼 초현실 단체사진",
    scores: [90, 99, 100, 86],
    fits: [99, 99, 100]
  },
  {
    key: "cinematic-motion-blur",
    patterns: [/cinematic blur/i, /motion blur/i, /imperfect exposure/i, /casual nighttime framing/i],
    title: "Cinematic Motion-Blur Pet",
    description: "의도적인 흔들림, 빛의 궤적과 순간 포착으로 영화 스틸처럼 보이는 사진",
    adaptation: "밤 산책 중 반려동물은 또렷하게 남고 배경만 흐르는 역동적인 영화 스냅",
    scores: [93, 91, 98, 87],
    fits: [94, 94, 90]
  },
  {
    key: "fashion-magazine-cover",
    patterns: [/magazine cover/i, /fashion editorial/i, /editorial (shoot|portrait)/i, /cover star/i],
    title: "Pet Fashion Magazine Cover",
    description: "강한 시선, 여백, 정교한 조명으로 만든 럭셔리 패션 매거진 표지 화보",
    adaptation: "반려동물을 세계적인 패션잡지의 9월호 커버 스타처럼 촬영",
    scores: [88, 99, 99, 97],
    fits: [99, 99, 100]
  },
  {
    key: "miniature-world",
    patterns: [/miniature/i, /tiny world/i, /scale contrast/i],
    title: "Miniature Pet Workplace",
    description: "작은 주인공과 일상 사물의 큰 스케일 차이를 활용한 정교한 미니어처 세계",
    adaptation: "반려동물이 손바닥만 한 가게나 작업실에서 사람처럼 일하는 장면",
    scores: [86, 98, 98, 94],
    fits: [92, 92, 100]
  },
  {
    key: "poetcore-portrait",
    patterns: [/poetcore/i, /poet core/i, /literary aesthetic/i],
    title: "Poetcore Pet Study",
    description: "낡은 종이, 잉크, 타자기와 침잠한 조명으로 만든 문학적 초상",
    adaptation: "반려동물을 오래된 서재에서 시를 쓰는 작가처럼 촬영한 고요한 화보",
    scores: [86, 92, 91, 95],
    fits: [93, 96, 94]
  },
  {
    key: "alien-core",
    patterns: [/alien.core/i, /alien aesthetic/i, /extraterrestrial/i, /sci.fi portrait/i],
    title: "Alien-Core Pet Encounter",
    description: "복고 SF 세트, 비현실적인 색광과 낯선 행성 풍경을 결합한 외계 미학",
    adaptation: "반려동물이 작은 우주복을 입고 복고풍 외계 행성에 처음 도착한 인증사진",
    scores: [87, 95, 99, 89],
    fits: [95, 95, 99]
  },
  {
    key: "festive-heritage-transform",
    patterns: [/festive.{0,25}(photo|selfie|portrait)/i, /heritage.{0,20}(photo|fashion|portrait)/i, /onam ai/i],
    title: "Festive Heritage Pet Portrait",
    description: "전통 의상과 지역 축제의 색, 꽃 장식, 의례적 구도를 현대 사진으로 재해석",
    adaptation: "반려동물을 지역 축제의 정중한 기념 초상 주인공으로 표현",
    scores: [91, 96, 97, 93],
    fits: [95, 95, 98]
  },
  {
    key: "sports-lifestyle-editorial",
    patterns: [/tenniscore/i, /sports.{0,20}(lifestyle|fashion|street style)/i],
    title: "Pet Sports-Lifestyle Editorial",
    description: "운동 경기의 유니폼, 코트 선, 땀과 응원 문화를 일상 패션 화보로 번역",
    adaptation: "반려동물을 경기 전 코트에 선 작은 스포츠 스타처럼 촬영",
    scores: [93, 95, 98, 94],
    fits: [97, 95, 98]
  },
  {
    key: "aura-farming-standoff",
    patterns: [/aura farming/i, /viral battles/i],
    title: "Pet Aura-Farming Standoff",
    description: "아무 설명 없이 태연한 자세와 강한 시선만으로 압도적인 존재감을 만드는 밈 구도",
    adaptation: "작은 반려동물이 거대한 공간 한가운데서 아무렇지 않게 모두의 시선을 장악하는 장면",
    scores: [97, 99, 95, 98],
    fits: [98, 98, 100]
  },
  {
    key: "absurd-character-horror",
    patterns: [/cat in the hat.{0,30}(horror|trend|video)/i, /viral horror trend/i, /fun fake videos/i],
    title: "Absurd Pet Doorway Cameo",
    description: "익숙한 캐릭터가 예상 못 한 문간이나 배경에 갑자기 등장하는 저예산 호러 코미디",
    adaptation: "평범한 집 사진 뒤편 문틈에 같은 반려동물이 기묘하게 한 번 더 등장하는 장면",
    scores: [96, 98, 94, 96],
    fits: [97, 97, 99]
  },
  {
    key: "rainbow-dolphin-surreal",
    patterns: [/rainbow dolphin/i, /symphony dolphin/i],
    title: "Rainbow Pet Dreamscape",
    description: "무지개, 돌고래, 반짝이는 바다처럼 과도하게 낙관적인 이미지를 진지하게 사용하는 초현실 밈",
    adaptation: "반려동물이 무지개와 반짝이는 바다를 가르는 과장된 2000년대 판타지 배경화면",
    scores: [95, 97, 94, 96],
    fits: [97, 97, 99]
  },
  {
    key: "nostalgia-time-capsule",
    patterns: [/time capsule/i, /\b\d{4}\s+(?:vs|versus)\s+\d{4}\b/i, /then.{0,12}(?:vs|versus).{0,12}now/i],
    title: "Then-vs-Now Pet Time Capsule",
    description: "과거의 낮은 화질 사진과 현재 사진을 같은 자세·장소·구도로 재현하는 시간 비교",
    adaptation: "반려동물의 어린 시절과 지금을 같은 가족사진 구도로 나란히 보여주는 타임캡슐",
    scores: [95, 99, 90, 98],
    fits: [99, 99, 99]
  },
  {
    key: "toy-scene-reenactment",
    patterns: [/re.created.{0,20}(scene|photo)/i, /actual toys/i, /toy story scene/i],
    title: "Pet Movie-Scene Reenactment",
    description: "익숙한 영화 장면을 집에 있는 실제 장난감과 생활 소품만으로 재현",
    adaptation: "반려동물을 유명 영화 스틸의 주연으로 두고 주변을 장난감 세트로 재구성",
    scores: [92, 98, 91, 96],
    fits: [97, 97, 100]
  },
  {
    key: "cinematic-place-postcard",
    patterns: [/made.{0,20}(place|country|city).{0,20}cinematic/i, /look cinematic/i, /cinematic.{0,20}(lens|location|travel)/i],
    title: "Cinematic Pet Location Postcard",
    description: "평범한 장소를 와이드 구도, 대기 원근감, 영화 색보정으로 서사적인 여행지로 보이게 하는 사진",
    adaptation: "반려동물이 낯선 도시의 주인공처럼 걷는 와이드 영화 포스터형 여행사진",
    scores: [90, 97, 95, 94],
    fits: [97, 96, 91]
  },
  {
    key: "parallel-self-swap",
    patterns: [/face swap/i, /character consistency/i, /locked faces/i, /single reference image/i],
    title: "Pet Parallel-Self Portrait",
    description: "동일한 얼굴과 정체성을 유지한 채 서로 다른 시대·직업·세계의 버전을 한 프레임에 배치",
    adaptation: "같은 반려동물의 왕실, 우주, 직장인 버전이 한 가족사진에 함께 모인 장면",
    scores: [91, 99, 89, 96],
    fits: [98, 98, 100]
  },
  {
    key: "owner-pet-visual-comparison",
    patterns: [
      /(?:owner|human|person).{0,30}(?:pet|dog|cat).{0,30}(?:comparison|lookalike|split.face|matching pose|mirror pose)/i,
      /(?:pet|dog|cat).{0,30}(?:owner|human|person).{0,30}(?:comparison|lookalike|split.face|matching pose|mirror pose)/i
    ],
    title: "Owner-Pet Visual Comparison",
    description: "보호자와 반려동물의 얼굴, 표정 또는 같은 자세를 직접 비교해야 의미가 완성되는 관계형 초상",
    adaptation: "보호자와 반려동물이 같은 표정과 자세를 나란히 보여주는 직접 비교 초상",
    scores: [94, 98, 91, 97],
    fits: [99, 99, 96]
  },
  {
    key: "eye-contact-campaign",
    patterns: [/eye contact/i, /intense gaze/i],
    title: "Direct-Eye-Contact Pet Close-Up",
    description: "극단적인 클로즈업과 정면 응시로 스크롤을 멈추게 하는 광고 사진",
    adaptation: "반려동물의 눈과 코를 왜곡 없이 크게 담고 정면 시선으로 교감하는 초근접 초상",
    scores: [89, 98, 100, 99],
    fits: [99, 99, 99]
  },
  {
    key: "color-drenching",
    patterns: [/colour drenching/i, /color drenching/i, /monochromatic.{0,15}(room|portrait|set)/i],
    title: "Color-Drenched Pet Room",
    description: "벽, 가구, 소품을 한 가지 강렬한 색으로 통일해 주인공의 실루엣을 강조",
    adaptation: "반려동물의 털색과 대비되는 단색 방 전체를 하나의 컬러 세트처럼 구성",
    scores: [90, 99, 99, 97],
    fits: [98, 98, 100]
  },
  {
    key: "cozy-hands-on-hobby",
    patterns: [/cozy.{0,20}hands.on hobbies/i, /screen time.{0,30}hobbies/i],
    title: "Cozy Pet Craft Table",
    description: "화면을 끄고 뜨개질, 도예, 종이 공예 같은 손작업에 몰입하는 아늑한 생활 장면",
    adaptation: "반려동물이 작은 공예 테이블에서 서툴지만 진지하게 손작업을 하는 생활 사진",
    scores: [92, 95, 96, 98],
    fits: [97, 96, 100]
  },
  {
    key: "curated-clutter-maximalism",
    patterns: [/clutter.{0,20}(design|choice|aesthetic)/i, /curated clutter/i],
    title: "Curated-Clutter Pet Hideout",
    description: "수집품, 책, 패턴과 작은 추억 물건을 풍성하게 쌓되 시선이 머물 곳을 설계한 맥시멀리즘",
    adaptation: "반려동물이 보호자의 다채로운 수집품 사이 자기만의 아지트에 파묻힌 장면",
    scores: [91, 98, 93, 97],
    fits: [97, 98, 100]
  },
  {
    key: "statement-metal-accessory",
    patterns: [/arm cuffs/i, /chunky accessor/i, /statement jewelry/i],
    title: "Statement-Metal Pet Editorial",
    description: "하나의 거대한 금속 액세서리와 단순한 배경으로 조형미를 강조한 패션 화보",
    adaptation: "안전한 대형 메탈릭 이름표 하나만 포인트로 둔 반려동물 하이패션 초상",
    scores: [91, 96, 99, 96],
    fits: [97, 97, 99]
  }
];

const originalTrendByKey = {
  "retro-direct-flash-dump": "Direct-flash casual photo dumps and Y2K digital-camera photography",
  "scrapbook-carousel": "Scrapbook-style carousel and mini-magazine layouts",
  "august-photo-grid": "Monthly recap photo grids and August photo dumps",
  "documentary-confession": "Unposed documentary snapshots with confession-style subtitles",
  "paparazzi-chaos": "Paparazzi flash and behind-the-scenes photo-shoot framing",
  "color-hunt": "Single-colour photography hunts",
  "glitchy-glam": "Intentionally imperfect and mismatched glitchy glamour",
  "y2k-bedazzled": "Y2K rhinestone and bedazzled styling",
  "glamoratti-power": "1980s power dressing and Glamoratti maximalism",
  "cool-blue-glacier": "Icy-blue and glacier aesthetics",
  "throwback-childhood": "Childhood nostalgia and retro-toy throwbacks",
  "niche-costume": "Niche Halloween and runway-reference costumes",
  "dark-balletcore": "Darker performance-led balletcore",
  "clone-crowd": "Repeated-character and clone-crowd AI imagery",
  "cinematic-motion-blur": "Cinematic motion blur and imperfect night exposure",
  "fashion-magazine-cover": "Fashion-editorial magazine cover portraits",
  "miniature-world": "Miniature worlds and dramatic scale contrast",
  "poetcore-portrait": "Poetcore and literary aesthetics",
  "alien-core": "Alien-core and retro science-fiction portraiture",
  "festive-heritage-transform": "AI festive heritage portrait transformations",
  "sports-lifestyle-editorial": "Sports-as-lifestyle and tenniscore editorials",
  "aura-farming-standoff": "Aura-farming poses and viral public standoffs",
  "absurd-character-horror": "Unexpected familiar-character horror cameos",
  "rainbow-dolphin-surreal": "Rainbow Dolphin and Symphony Dolphin meme imagery",
  "nostalgia-time-capsule": "Then-versus-now and nostalgia time-capsule portraits",
  "toy-scene-reenactment": "Household-toy recreations of familiar movie scenes",
  "cinematic-place-postcard": "Cinematic location and travel photography",
  "parallel-self-swap": "Consistent-character and parallel-self image transformations",
  "owner-pet-visual-comparison": "Direct owner-and-pet visual comparisons and matching-pose portraits",
  "eye-contact-campaign": "Direct-eye-contact advertising close-ups",
  "color-drenching": "Monochromatic colour-drenched rooms and sets",
  "cozy-hands-on-hobby": "Screen-free cozy hands-on hobbies",
  "curated-clutter-maximalism": "Curated-clutter maximalist interiors",
  "statement-metal-accessory": "Oversized statement-metal accessories"
};

const experienceByKey = {
  "retro-direct-flash-dump": {
    owner_mode: "optional",
    owner_requirement_reason: "The casual snapshot format works without an owner, so the owner is omitted by policy.",
    post_format: "carousel",
    carousel_fit_score: 94,
    preferred_slide_count: 4,
    carousel_reason: "A photo dump is stronger as several consistent moments than as one isolated frame.",
    carousel_storyboard_type: "photo_dump"
  },
  "scrapbook-carousel": {
    post_format: "carousel",
    carousel_fit_score: 96,
    preferred_slide_count: 4,
    carousel_reason: "The mini-magazine format depends on swiping through related pages.",
    carousel_storyboard_type: "scrapbook"
  },
  "august-photo-grid": {
    post_format: "carousel",
    carousel_fit_score: 93,
    preferred_slide_count: 4,
    carousel_reason: "Multiple late-summer variations are the core of the recap format.",
    carousel_storyboard_type: "photo_dump"
  },
  "nostalgia-time-capsule": {
    post_format: "carousel",
    carousel_fit_score: 97,
    preferred_slide_count: 4,
    carousel_reason: "A swipe sequence makes the past-to-present comparison clearer.",
    carousel_storyboard_type: "then_now"
  },
  "absurd-character-horror": {
    post_format: "carousel",
    carousel_fit_score: 88,
    preferred_slide_count: 4,
    carousel_reason: "Progressive discovery and a final reveal strengthen the doorway cameo.",
    carousel_storyboard_type: "reveal"
  },
  "cinematic-place-postcard": {
    owner_mode: "optional",
    owner_requirement_reason: "The travel scene remains complete with the pet alone."
  },
  "cinematic-motion-blur": {
    owner_mode: "optional",
    owner_requirement_reason: "The night-walk snapshot does not require a visible owner."
  },
  "owner-pet-visual-comparison": {
    owner_mode: "required",
    owner_requirement_reason: "The original visual format depends on a direct human-pet comparison.",
    post_format: "single",
    carousel_fit_score: 55,
    preferred_slide_count: 1,
    carousel_reason: "A single direct comparison frame communicates the concept most clearly."
  }
};

function experienceMetadataForKey(key) {
  return {
    owner_mode: "none",
    owner_requirement_reason: "",
    post_format: "single",
    carousel_fit_score: 0,
    preferred_slide_count: 1,
    carousel_reason: "",
    carousel_storyboard_type: "progression",
    ...(experienceByKey[key] || {})
  };
}

function conceptId(key) {
  return `trend-${createHash("sha1").update(key).digest("hex").slice(0, 12)}`;
}

function analyzeCandidate(candidate) {
  const text = `${candidate.title} ${candidate.description} ${(candidate.keywords || []).join(" ")}`;
  const rule = conceptRules.find(item => item.patterns.some(pattern => pattern.test(text)));
  if (!rule) return null;
  const matchedPatterns = rule.patterns.filter(pattern => pattern.test(text)).map(pattern => pattern.source);
  return {
    concept_id: conceptId(rule.key),
    concept_key: rule.key,
    title: rule.title,
    original_trend: originalTrendByKey[rule.key] || candidate.title,
    pet_adaptation: rule.title,
    description: rule.description,
    adaptation: rule.adaptation,
    keywords: keywordsFromText(`${rule.title} ${rule.description} ${rule.adaptation}`),
    baseline_scores: {
      pet_adaptability: rule.scores[0],
      visual_impact: rule.scores[1],
      replicability: rule.scores[2],
      account_fit: rule.scores[3]
    },
    fit_scores: { dog: rule.fits[0], cat: rule.fits[1], hamster: rule.fits[2] },
    ...experienceMetadataForKey(rule.key),
    grounding_patterns: matchedPatterns,
    grounded_candidate_urls: candidate.source_url ? [candidate.source_url] : [],
    candidates: [candidate]
  };
}

export { analyzeCandidate, conceptId, conceptRules, experienceMetadataForKey, originalTrendByKey };
