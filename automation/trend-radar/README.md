# Trend Radar

인터넷 전체의 시각 트렌드를 수집하고, 반려동물 사진 한 장으로 재현 가능한 Instagram 아이디어로 정규화하는 독립 모듈입니다. Instagram을 직접 크롤링하거나 게시하지 않습니다.

## 실행

```powershell
npm run trend:dry-run
npm run trend:refresh
npm run trend:evidence
node automation/trend-radar/runner.mjs --dry-run --account hamnimi
npm run trend:test
```

`trend:dry-run`은 12시간 이내 캐시를 사용합니다. `trend:refresh`는 캐시를 무시하고 공개 웹을 다시 조사합니다. 결과는 콘솔 TOP 10과 다음 런타임 JSON에 저장됩니다.

- `automation/data/trend_candidates.json`
- `automation/data/trend_concepts.json`
- `automation/data/trend_history.json`
- `automation/data/account_performance.json`

이 파일들은 실행 때 계속 바뀌므로 Git에서 제외됩니다.

`trend:evidence` 또는 `--show-evidence`는 전체 source provenance와 URL, source quality, 독립 근거 판정을 출력합니다. v0.2 캐시는 `schema_version: 2`이며 v0.1 캐시는 자동으로 새로 수집합니다.

## v0.2 흐름

1. **Raw sources:** Google News RSS의 폭넓은 검색어, 공개 트렌드 기사, Reddit 공개 JSON/RSS를 collector별로 병렬 수집합니다.
2. collector 실패는 격리합니다. 최근 7일 후보가 부족하면 30일 범위를 사용합니다.
3. **Raw trend signal:** collector가 원 게시자, source type, 플랫폼, URL, 제목과 검증 가능한 게시일을 보존합니다. 날짜 없는 페이지는 수집일을 게시일로 가장하지 않습니다.
4. **Trend cluster:** `analyzer.mjs`가 source에서 실제로 일치한 패턴만 `original_trend`로 정규화합니다. 창의적인 반려동물 결과인 `pet_adaptation`과 별도로 저장합니다.
5. **Evidence validation:** 같은 원 게시자, 같은 도메인 또는 의미상 동일한 제목을 하나의 independent source group으로 묶고 7일·30일 신호, 플랫폼 수와 source quality를 계산합니다.
6. **Pet adaptation:** 원본 트렌드가 실제 source URL과 pattern으로 검증된 컨셉만 dog/cat/hamster 버전으로 변환합니다.
7. **Account fit/scoring:** 최근 게시물 최대 30개와 60일 이내 선택 이력을 비교하고, 근거가 약한 trend score를 상한 처리합니다.
8. **Final concept:** weak signal은 저장하되 기본 점수에서 18점을 감점하며 자동 게시 추천에서는 제외합니다.

각 최종 컨셉은 `original_trend`, `pet_adaptation`, `source_evidence`, `independent_source_count`, `recent_source_count_7d`, `recent_source_count_30d`, `cross_platform_count`, `latest_source_date`, `evidence_strength`, `weak_signal`, `trend_momentum`을 포함합니다.

또한 Kongi 실행 형식을 위한 `owner_mode`, `owner_requirement_reason`, `post_format`, `carousel_fit_score`, `preferred_slide_count`, `carousel_reason`, `carousel_storyboard_type`을 포함합니다. 기본값은 `none + single`입니다. 보호자가 없으면 직접 비교·같은 자세·split-face 같은 핵심 아이디어가 성립하지 않는 명시적 human-pet 비교 컨셉만 `required`로 표시합니다. 여행·생활 스냅처럼 보호자 없이도 성립하면 `optional` 또는 `none`이며 실제 운영에서는 둘 다 보호자를 생략합니다.

Carousel은 photo dump, mini-magazine, then-vs-now, 시간 흐름, 단계적 reveal처럼 여러 장이 시각적 핵심을 명확히 강화할 때만 선택합니다. 단순히 여러 장으로 만들 수 있다는 이유만으로 carousel을 지정하지 않으며 기본 content slide 수는 4장입니다.

## 독립 출처와 source quality

- Google News URL은 aggregator 도메인 대신 RSS에 포함된 원 게시자 이름으로 구분합니다.
- 같은 게시자·도메인의 여러 항목은 독립 출처 하나로 계산합니다.
- 서로 다른 게시자라도 제목 의미 유사도가 config threshold 이상이면 재배포/aggregation 그룹 하나로 계산합니다.
- 공식 trend report, 전문 매체, tracker, meme database, community, 일반 기사, SEO성 source의 품질값은 `config.mjs`의 `sourceQuality`와 `sourceQualityDomains`에서 조정합니다.
- collector query가 붙인 플랫폼 metadata보다 제목·source·URL에서 명시적으로 확인되는 TikTok, Instagram, Pinterest, Reddit, meme/fashion 신호를 우선합니다.

## Evidence strength와 weak signal

`evidence_strength`는 독립 출처 25%, 최근 7일 25%, 최근 30일 10%, cross-platform 20%, source quality 10%, 최신 신호 10%로 계산합니다. target count와 가중치는 config에서 수정합니다.

다음 중 하나도 만족하지 않으면 기본적으로 weak signal입니다.

- independent source 2개 이상
- 최근 7일의 날짜 확인 가능한 독립 source 2개 이상
- cross-platform/source-type channel 2개 이상

Evidence가 30 미만이면 trend score 최대 50, 50 미만이면 최대 70, 70 미만이면 최대 85입니다.

## 점수

기본 가중치는 `config.mjs`에서 수정합니다.

| 점수 | 기본 가중치 | 계산 |
|---|---:|---|
| `trend_score` | 15% | 최신성·반복 신호에 evidence 상한 적용 |
| `evidence_strength` | 15% | 독립 출처·7d/30d·플랫폼·품질·freshness |
| `pet_adaptability` | 20% | 반려동물 버전의 자연스러움과 따라 만들기 욕구 |
| `visual_impact` | 20% | 썸네일 이해도와 시각적 대비 |
| `replicability` | 10% | 사진 한 장으로 재현할 가능성 |
| `account_fit` | 10% | dog/cat/hamster 계정별 적합도 |
| `novelty` | 10% | 최근 게시·선택 컨셉과의 의미 거리 |
| `performance_potential` | 0% | Insights 표본 부족 시 50, 추후 가중치 활성화 가능 |

## 캐시와 fallback

- `generated_at`이 12시간 이내면 네트워크 없이 캐시를 사용합니다. TTL은 `TREND_RADAR_CACHE_TTL_HOURS`로 바꿀 수 있습니다.
- 갱신 중 인터넷, 검색, Reddit, 페이지 파싱 또는 분석이 실패하면 오래된 유효 캐시를 먼저 사용합니다.
- 캐시도 없으면 `getBestTrendForAccount`는 예외 대신 `{ ok: false, fallback: true }`를 반환합니다.
- 기존 `preflight`는 이 결과를 `trend_radar` 필드에 넣습니다. 실패 시 기존 `idea_guidance`, 게시 이력, Insights 기반 기획이 그대로 유지됩니다.
- `trend_history.json`의 evidence snapshot과 직전 independent source count를 비교해 `new`, `rising`, `stable`, `declining`, `unknown` momentum을 계산합니다. 최초 snapshot은 `unknown`입니다.

## 공개 인터페이스

```js
import { getBestTrendForAccount } from "./trend-radar/index.mjs";

const result = await getBestTrendForAccount("kongi");
if (result.ok) {
  console.log(result.concept);
}
```

실제 사용 확정 시에만 `{ recordSelection: true }`를 전달해 선택 이력을 기록합니다. 단순 preflight 추천은 사용한 것으로 기록하지 않습니다.

## Windows 자동 실행

Windows Task Scheduler 작업 `Damyo Trend Radar`가 로컬 시간 기준 매일 `08:30`, `20:30`에 Trend Radar refresh와 Kongi shadow 기록을 차례로 실행합니다. 작업은 Instagram 게시, 이미지·caption 생성, GitHub asset push 또는 Meta API를 호출하지 않습니다.

- wrapper: `automation/scheduler/run-trend-radar.ps1`
- 등록 스크립트: `automation/scheduler/register-trend-radar-task.ps1`
- 로그: `automation/logs/trend-scheduler.log` (5MB, 백업 3개)
- runtime 출력: `automation/data/trend_candidates.json`, `trend_concepts.json`, `trend_history.json`, `trend_shadow_history.json`

수동 실행과 작업 등록:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File automation/scheduler/run-trend-radar.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File automation/scheduler/register-trend-radar-task.ps1
```

상태 확인, 즉시 실행, 비활성화와 삭제:

```powershell
Get-ScheduledTask -TaskName "Damyo Trend Radar"
Get-ScheduledTaskInfo -TaskName "Damyo Trend Radar"
Start-ScheduledTask -TaskName "Damyo Trend Radar"
Disable-ScheduledTask -TaskName "Damyo Trend Radar"
Unregister-ScheduledTask -TaskName "Damyo Trend Radar" -Confirm:$false
```

작업은 놓친 예약을 가능한 한 빨리 실행(`StartWhenAvailable`), 이미 실행 중이면 새 instance 무시(`IgnoreNew`), PC 깨우기 비활성으로 등록됩니다. wrapper도 파일 잠금을 사용하며 refresh가 실패해도 shadow가 유효 캐시로 실행될 수 있도록 계속 진행합니다. shadow까지 실패하면 게시 파이프라인에 진입하지 않고 오류 로그와 nonzero exit code만 남깁니다.

## Kongi 1단계 실제 선택 연결

`automation/idea-selector.mjs`가 preflight의 아이디어 출처를 결정합니다. 기본값은 OFF이며 다음 설정을 사용합니다.

```text
TREND_RADAR_ENABLE_SELECTION=false
TREND_RADAR_SELECTION_ACCOUNTS=kongi
TREND_RADAR_MIN_EVIDENCE=50
TREND_RADAR_ALLOW_DECLINING=false
TREND_RADAR_DUPLICATE_THRESHOLD=0.72
KONGI_OWNER_REQUIRED_ENABLED=false
KONGI_CAROUSEL_IDEAS_ENABLED=false
KONGI_OWNER_OPTIONAL_POLICY=omit
```

ON 상태에서도 코드상 실제 선택 허용 계정은 `kongi`뿐입니다. publishable, 최소 Evidence, declining 정책과 최근 30개/60일 게시물 의미 중복 검사를 통과한 뒤 owner-required 후보는 owner reference 가용성까지 확인합니다. 사용할 수 없는 required 후보는 건너뛰고 다음 후보를 검사합니다. Carousel flag가 꺼져 있거나 metadata가 없는 concept은 기존 single 경로를 유지합니다. 조건 미달이나 오류는 기존 generator로 fallback하며 Hamnimi 정책은 바뀌지 않습니다.
