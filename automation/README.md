# 반려동물 멀티계정 Instagram 자동 포스팅

공통 엔진 하나에 계정 설정과 기준 이미지를 연결합니다. 현재 계정은 다음과 같습니다.

| account key | 표시 이름 | site animal | reference |
|---|---|---|---|
| `kongi` | 콩이 | `dog` | `automation/reference/kongi.png` |
| `hamnimi` | 햄님이 | `small` | `automation/reference/hamnimi.png` |

Kongi의 생성형 보호자 reference는 `automation/reference/kongi-owner.png`에 둡니다. 이 파일은 `owner_mode: "required"`인 Kongi 컨셉에서만 generation reference로 전달하며 `optional`과 `none`에서는 존재 여부와 무관하게 사용하지 않습니다. Hamnimi에는 owner/carousel 확장을 적용하지 않습니다.

운영 명령은 계정별로 분리됩니다.

```text
콩이 자동 포스팅 실행
햄님이 자동 포스팅 실행
```

이 명령을 받은 Codex는 `automation/run.mjs`의 공통 파이프라인을 해당 계정 설정으로 실행합니다. 이미지 생성에는 Codex 앱의 기본 이미지 생성/편집 기능만 사용합니다. `OPENAI_API_KEY`, OpenAI REST API, OpenAI SDK를 사용하거나 요구하지 않습니다.

계정별 차이는 `automation/accounts/*.mjs`의 `displayName`, `animal`, reference, `instagramCtaImage`, 아이디어 지침, Instagram 환경변수뿐입니다. ID 계산, 사이트 수정, 검수, Git, 배포 확인, Instagram 게시, Insights, snapshot, rate 계산, 중복 방지는 공통 엔진에 한 번만 구현됩니다.

## Trend Radar 아이디어 입력

`automation/trend-radar/`는 최근 공개 웹의 사진·패션·밈·AI 이미지·광고·여행·향수·반려동물 시각 트렌드를 폭넓게 수집한 뒤 반려동물 버전으로 번역합니다. Instagram Explore는 직접 크롤링하지 않습니다.

```powershell
npm run trend:dry-run
npm run trend:refresh
npm run trend:evidence
npm run trend:test
```

`preflight` 결과의 `trend_radar.concept`는 현재 계정의 추천 아이디어입니다. `TREND_RADAR_ENABLE_SELECTION=true`이면 1단계 운영 대상인 `kongi`에서만 publishable·Evidence·Momentum·최근 중복 조건을 다시 통과한 최상위 후보가 `selected_idea`와 실제 `idea_guidance`가 됩니다. `hamnimi`는 flag 설정과 무관하게 기존 generator 흐름을 유지합니다. 비활성화·미지원 계정·조건 미달·Radar 오류는 `idea_source: "fallback_generator"`와 원래 `idea_guidance`로 안전하게 복귀합니다. 상세 구조는 `automation/trend-radar/README.md`를 참고합니다.

Kongi 전용 실행 정책은 `KONGI_OWNER_REQUIRED_ENABLED`, `KONGI_CAROUSEL_IDEAS_ENABLED`로 각각 켭니다. 기본값은 기존 동작 보존을 위해 OFF입니다. `KONGI_OWNER_OPTIONAL_POLICY=omit`은 고정 정책이며 optional owner를 실제 generation reference에서 항상 제외합니다. owner-required 후보인데 reference가 없거나 손상되면 다음 publishable 후보를 검사하고, 모두 실행 불가능하면 기존 generator로 fallback합니다.

## 최초 설정

1. `.env.example`을 `.env`로 복사합니다.
2. Instagram 전문 계정과 Meta 앱을 연결합니다.
3. Instagram Login 방식의 사용자 ID와 장기 액세스 토큰을 `.env`의 계정별 키에 넣습니다. 콩이는 `KONGI_INSTAGRAM_USER_ID`, `KONGI_INSTAGRAM_ACCESS_TOKEN`, 햄님이는 `HAMNIMI_INSTAGRAM_USER_ID`, `HAMNIMI_INSTAGRAM_ACCESS_TOKEN`을 사용합니다.
4. 앱/토큰에 `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights` 권한이 있어야 합니다.
5. 첫 검증은 `DRY_RUN=true`로 수행하고, 실제 운영 때만 `DRY_RUN=false`로 바꿉니다.
6. 계정별 고정 CTA를 `automation/assets/kongi-profile-cta.jpg`, `automation/assets/hamnimi-profile-cta.jpg`에 각각 1080×1350 JPEG로 둡니다. 파일 누락·손상·규격 오류 시 해당 계정의 Instagram 게시를 사이트 변경 전에 중단하며 다른 계정 CTA로 대체하지 않습니다.

비밀값은 `.env`에만 저장되며 `.gitignore`로 제외됩니다.

기존 콩이 설치의 `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`은 콩이에만 fallback으로 지원됩니다. 햄님이는 이 legacy 값을 절대 사용하지 않습니다. 햄님이 자격증명이 없으면 DRY RUN과 로컬 테스트는 가능하지만 읽기 전용 Meta 인증과 실제 게시에는 진입하지 않습니다.

## Codex 실행 절차

### 1. 성과 업데이트, 안전 점검과 실행 ID 생성

```powershell
node automation/run.mjs preflight kongi
node automation/run.mjs preflight hamnimi
```

먼저 과거 게시물의 읽기 전용 Media Insights를 갱신하고 `performance_context`를 만듭니다. 그다음 Git worktree가 깨끗하지 않으면 즉시 중단합니다. 성공 출력의 `run_id`, `post_id`, `run_dir`, 기존 강아지 게시물 요약과 성과 컨텍스트를 사용합니다. 완료되지 않은 실행이 있으면 같은 run을 이어가므로 중복 게시하지 않습니다.

Insights의 일시적 장애나 일부 미지원 지표는 새 게시를 막지 않습니다. 동일 토큰의 인증 만료가 확인된 경우에만 게시까지 실패할 가능성이 있으므로 안전하게 중단합니다. 계정 단위 Insights나 팔로워·인구통계에는 의존하지 않습니다.

### 2. 콘텐츠 기획과 초안

`preflight.idea_source`가 `trend_radar`이면 `selected_idea`를 실제 아이디어 입력으로 사용합니다. `fallback_generator`이면 Codex가 선택된 계정의 `animal` 게시물만 대상으로 `title`, `category`, `description`, `prompt`, `automation/posts/<accountKey>/`의 `idea_category`·`idea_summary`, 해당 계정 Instagram 성과, 최근 중복 여부를 비교하고 후보를 내부 평가한 뒤 하나를 자동 선정합니다. `automation/draft.example.json` 형식으로 `<run_dir>/draft.json`을 만들고 `account_key`를 기록합니다. 후보 평가는 신선도, 생성 성공 가능성, 보호자의 따라하기 욕구, 과거 성과, 중복, 탐색 가치를 함께 봅니다.

preflight의 `owner_mode`, `owner_asset_available`, `owner_asset_used`, `post_format`, `preferred_slide_count`, `slides`를 draft에 그대로 반영합니다. metadata가 없는 기존 아이디어와 draft는 `owner_mode: "none"`, `post_format: "single"`로 처리됩니다. Carousel draft는 3~5개의 순서가 있는 `slides`를 가지며 기본은 `hook → setup → development → reveal` 4장입니다. 각 slide의 `scene`은 같은 원본 컨셉과 visual language를 공유해야 합니다.

햄님이는 작은 체구가 분명히 드러나는 미니어처, 스케일 대비, 사람처럼 행동하는 상황극, 실제 보호자의 스마트폰 스냅 같은 콘텐츠에 가산점을 줍니다. 기존 `animal: "small"` 콘텐츠와 구도·테마·상황·소품이 사실상 같은 아이디어는 피합니다.

표본 1~4개는 성과를 수집만 하고, 5~9개는 약한 참고 신호, 10~19개는 의미 있는 신호, 20개 이상은 더 적극적인 신호로 사용합니다. 성과 기반 활용은 약 75%, 새 아이디어 탐색은 약 25%를 목표로 하며 탐색을 0으로 만들지 않습니다. 저장·공유와 `save_rate`·`share_rate`를 좋아요보다 중요한 가치 신호로 보되 성과를 절대 목표로 삼지 않습니다.

공유용 `prompt`에는 “콩이”라는 이름을 넣지 않고 다음을 모두 포함합니다.

- 동일 개체와 털색·무늬·얼굴형·눈·코·입·귀 유지
- 구체적 장면, 카메라 구도, 조명, 배경, 분위기
- 반려동물이 주인공임을 명시
- 신체·눈·귀·발 왜곡 방지
- 글자, 워터마크, SNS UI 제외
- Instagram 세로 4:5

`generation_prompt`는 Codex 내부 생성용이므로 콩이의 이름과 기준 사진 특징을 포함해도 됩니다. `caption`은 짧은 훅, 콩이 장면 설명, 프로필 링크 안내, 관련 해시태그 소수로 작성합니다.

### 3. Codex 기본 이미지 생성과 시각 검수

기본적으로 `automation/reference/kongi.png`만 reference image로 사용합니다. preflight가 `owner_asset_used: true`라고 명시한 owner-required Kongi 컨셉에서만 `automation/reference/kongi-owner.png`를 함께 사용합니다. Optional과 none에서는 owner reference를 전달하거나 결과에 보호자를 등장시키지 않습니다.

Single은 기존처럼 세로 4:5 이미지 한 장을 생성합니다. Carousel은 slide 1에 Kongi reference(필요 시 owner reference)를 사용하고, slide 2~4에는 같은 canonical reference와 통과한 slide 1 anchor를 함께 참고해 identity와 visual language를 유지합니다. 생성물은 `<run_dir>/slide-1-attempt-1.*`처럼 slide별로 보존하며, 실패한 slide만 최대 3회 재생성합니다.

각 시도마다 `automation/review.example.json` 형식의 `<run_dir>/review-N.json`을 기록합니다. 다음 중 하나면 문제를 생성 지침에 반영해 다시 생성합니다.

```text
identity_score < 75
visual_quality_score < 80
concept_score < 80
fatal_issue == true
```

Carousel은 `automation/carousel-review.example.json` 형식으로 각 slide를 따로 검수합니다. 기존 기준을 그대로 유지하면서 `carousel_consistency_score >= 80`을 추가하고, 보호자가 실제 등장하는 slide는 `owner_identity_score >= 75`도 요구합니다. 검수 대상은 Kongi identity, 필요한 owner identity, visual style, storyboard continuity입니다.

최대 3회입니다. 모두 실패하면 다음 명령으로 실패를 기록하고 사이트·Git·Instagram을 건드리지 않습니다.

```powershell
node automation/run.mjs fail <accountKey> --run-id <run_id> --reason "세 번의 이미지 검수 실패"
```

통과 이미지는 다음 명령으로 각각 1080×1350 JPEG를 준비합니다. 원본 비율이 4:5에서 2% 넘게 벗어나면 자동 크롭하지 않고 실패합니다.

```powershell
powershell -ExecutionPolicy Bypass -File automation/prepare-image.ps1 `
  -InputPath <run_dir>/attempt-N.png `
  -OutputPath <run_dir>/attempt-N-final.jpg
```

변환된 JPEG도 Codex가 다시 열어 얼굴, 귀, 발과 주요 소품이 프레임 안에 있는지 확인한 뒤 `complete`에 전달합니다.

### 4. 완료 파이프라인

```powershell
node automation/run.mjs complete <accountKey> --draft <run_dir>/draft.json --image <run_dir>/attempt-N-final.jpg --review <run_dir>/review-N.json
```

Carousel은 storyboard 순서대로 `--image`, `--review`를 반복합니다.

```powershell
node automation/run.mjs complete kongi `
  --draft <run_dir>/draft.json `
  --image <run_dir>/slide-1-final.jpg --review <run_dir>/review-slide-1.json `
  --image <run_dir>/slide-2-final.jpg --review <run_dir>/review-slide-2.json `
  --image <run_dir>/slide-3-final.jpg --review <run_dir>/review-slide-3.json `
  --image <run_dir>/slide-4-final.jpg --review <run_dir>/review-slide-4.json
```

`DRY_RUN=true`에서는 가상 게시물과 모든 데이터 검증 결과 및 콘텐츠→계정별 CTA Carousel payload만 `<run_dir>`에 저장합니다. `prompts.js`, Git, 공개 사이트, Instagram은 변경하지 않습니다. `node automation/run.mjs cta-check <accountKey>`로 CTA 파일·규격·공개 URL·child 순서를 Meta 요청 없이 별도 확인할 수 있습니다.

`DRY_RUN=false`에서는 검수 통과 후에만 다음 순서로 진행합니다.

1. `prompts.js` 타임스탬프 백업
2. Single은 `images/pXXX-01.jpg`, Carousel은 `images/pXXX-01.jpg`부터 순서대로 복사하고 `PROMPTS` 맨 앞에 하나의 게시물로 추가
3. JavaScript 문법, 배열, ID, 이미지 경로, 기존 개수 검증
4. 자동 생성 파일만 `git add`, commit, push
5. GitHub Pages 또는 `PUBLIC_SITE_URL`에서 콘텐츠 이미지와 계정별 CTA 이미지의 HTTP 200 확인
6. 모든 콘텐츠 이미지와 CTA를 각각 `is_carousel_item=true` child로 만들고 모두 준비된 뒤, `content_1 → ... → content_N → CTA` 순서의 기존 `media_type=CAROUSEL` parent에 caption을 적용하여 `/media_publish` 게시
7. media ID와 commit을 `automation/state/<accountKey>.json` 및 계정별 JSONL 로그에 저장
8. `automation/posts/<accountKey>/<post_id>.json`에 아이디어와 Instagram 게시 메타데이터 저장

공개 배포가 확인되지 않거나 Meta 설정/권한이 없으면 Instagram 게시 전에 안전하게 멈춥니다. 이미 `instagram_published`인 같은 run은 다시 게시하지 않습니다.
Git commit 이후 네트워크 오류나 Meta 자격증명 누락으로 멈춘 같은 run을 다시 실행하면 저장된 단계부터 이어가며 사이트 게시물을 중복 생성하지 않습니다.
CTA는 Instagram 전용 자산이므로 `prompts.js`의 `cover`나 `images[]`에는 넣지 않으며, 게시물마다 복사하지 않고 계정별 고정 파일 하나를 재사용합니다.


## 결정론적 검증

```powershell
npm run kongi:test
```

검증 항목은 `prompts.js` 파싱, 전체/동물별 개수, 다음 ID, 중복 ID, 이미지 경로, 공유 프롬프트 금칙어와 필수 지침, 이미지 검수 임계값, Git 변경 범위입니다.

## Instagram 성과만 업데이트

사용자가 `콩이 인스타 성과 업데이트`라고 요청하면 콘텐츠 생성·사이트 수정·Git·Instagram 게시 없이 다음 명령만 실행합니다.

```powershell
node automation/run.mjs insights kongi
node automation/run.mjs insights hamnimi
```

선택한 계정의 `instagram_media_id`만 대상으로 `reach`, `views`, `likes`, `comments`, `saved`, `shares`, `total_interactions`를 지표별로 독립 조회합니다. 미디어 유형이나 API 버전상 지원되지 않는 지표는 `{ "value": null, "status": "unsupported" }`에 해당하는 구조로 저장하고 나머지 수집을 계속합니다. 다른 계정의 토큰이나 성과 데이터로 fallback하지 않으며 토큰은 출력이나 로그에 남기지 않습니다.

모든 등록 계정을 한 번에 검사하는 독립 collector는 콘텐츠 생성이나 게시 없이 다음 명령으로 실행합니다.

```powershell
node automation/run.mjs insights
```

collector는 `automation/accounts/index.mjs`에 등록된 계정을 순서대로 처리합니다. 한 계정의 오류는 다음 계정으로 격리되고, 게시물별 오류도 가능한 범위에서 나머지 게시물 처리를 막지 않습니다. 계정별 파일 잠금으로 수동 실행·preflight·예약 실행이 겹쳐도 같은 snapshot을 동시에 쓰지 않습니다. 실행 요약은 `automation/logs/insights-collector/YYYY-MM-DD.jsonl`에 기록하며 30일이 지난 collector 로그는 다음 실행 때 삭제합니다.

Windows에서 매시간 자동 실행 작업을 등록하거나 갱신하려면 다음을 실행합니다. 작업은 현재 로그인한 사용자 세션에서 실행되고, 놓친 실행은 다음 기회에 시작하며, 이전 실행이 남아 있으면 새 인스턴스를 시작하지 않습니다.

```powershell
powershell -ExecutionPolicy Bypass -File automation/register-insights-task.ps1
```

게시 후 24h, 72h, 7d 체크포인트를 순서대로 채우며 실제 `collected_at`과 `age_hours`를 함께 기록합니다. 24시간 전 최초 수집은 `initial`이며 24h로 가장하지 않습니다. 체크포인트가 아닌 `latest`는 기본 12시간 간격이고, 7d 체크포인트가 끝난 오래된 게시물은 반복 조회하지 않습니다.

각 스냅샷에는 reach 기준 `like_rate`, `comment_rate`, `save_rate`, `share_rate`, `interaction_rate`를 저장합니다. reach가 0이거나 값이 없으면 비율은 `null`입니다. 카테고리 요약과 소표본 정책은 `automation/insights-summary.json`에 기록되어 다음 preflight의 `performance_context`로 전달됩니다.

## 런타임 파일

- `automation/reference/kongi.png`: 수정하지 않는 콩이 canonical reference
- `automation/reference/kongi-owner.png`: owner-required Kongi 컨셉에서만 사용하는 생성형 보호자 canonical reference
- `automation/runs/<accountKey>/<run_id>/`: 초안, 생성 시도, 검수, 가상 게시 데이터
- `automation/backups/<accountKey>/<timestamp>/`: 실제 수정 전 백업
- `automation/logs/<accountKey>/YYYY-MM-DD.jsonl`: 계정별 단계 로그
- `automation/state/<accountKey>.json`: 계정별 최신 run 단계, post ID, commit, Instagram media ID
- `automation/posts/<accountKey>/<post_id>.json`: 계정별 아이디어, 게시 메타데이터, Media Insights 스냅샷
- `automation/insights-summary/<accountKey>.json`: 계정별 카테고리 성과와 다음 기획 컨텍스트

기존 콩이 `automation/state.json`, `automation/posts/*.json`, `automation/insights-summary.json`은 최초 콩이 실행 때 새 계정별 위치로 안전하게 복사됩니다. 원본 runtime 파일은 삭제하지 않습니다.

런타임 파일과 `.env`는 Git에 포함되지 않습니다.
