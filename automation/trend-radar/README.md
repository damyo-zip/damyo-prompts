# Trend Radar

인터넷 전체의 시각 트렌드를 수집하고, 반려동물 사진 한 장으로 재현 가능한 Instagram 아이디어로 정규화하는 독립 모듈입니다. Instagram을 직접 크롤링하거나 게시하지 않습니다.

## 실행

```powershell
npm run trend:dry-run
npm run trend:refresh
node automation/trend-radar/runner.mjs --dry-run --account hamnimi
npm run trend:test
```

`trend:dry-run`은 12시간 이내 캐시를 사용합니다. `trend:refresh`는 캐시를 무시하고 공개 웹을 다시 조사합니다. 결과는 콘솔 TOP 10과 다음 런타임 JSON에 저장됩니다.

- `automation/data/trend_candidates.json`
- `automation/data/trend_concepts.json`
- `automation/data/trend_history.json`
- `automation/data/account_performance.json`

이 파일들은 실행 때 계속 바뀌므로 Git에서 제외됩니다.

## 흐름

1. Google News RSS의 폭넓은 검색어, 공개 트렌드 기사, Reddit 공개 JSON을 collector별로 병렬 수집합니다.
2. collector 실패는 격리합니다. 최근 7일 후보가 부족하면 30일 범위를 사용합니다.
3. `analyzer.mjs`가 링크를 재사용 가능한 이미지 컨셉으로 정규화합니다. 외부 AI API 없이 결정론적으로 실행되며 분석기 함수는 교체 주입할 수 있습니다.
4. 같은 컨셉 키를 묶고 여러 출처와 최초/최종 감지 시각을 보존합니다.
5. 최근 계정 게시물 최대 30개와 60일 이내 선택 이력을 의미 토큰으로 비교합니다. 유사도 0.72 이상은 제외합니다.
6. 계정별 적합도를 적용하고 가중 점수를 계산하여 정렬합니다.
7. `getBestTrendForAccount(accountName)`가 자동 게시 기획 단계에 최상위 컨셉 하나를 안전하게 제공합니다.

## 점수

기본 가중치는 `config.mjs`에서 수정합니다.

| 점수 | 기본 가중치 | 계산 |
|---|---:|---|
| `trend_score` | 20% | 최근성, 독립 출처 수, 플랫폼 신호, 반복 관측 |
| `pet_adaptability` | 25% | 반려동물 버전의 자연스러움과 따라 만들기 욕구 |
| `visual_impact` | 20% | 썸네일 이해도와 시각적 대비 |
| `replicability` | 15% | 사진 한 장으로 재현할 가능성 |
| `account_fit` | 10% | dog/cat/hamster 계정별 적합도 |
| `novelty` | 10% | 최근 게시·선택 컨셉과의 의미 거리 |
| `performance_potential` | 0% | Insights 표본 부족 시 50, 추후 가중치 활성화 가능 |

## 캐시와 fallback

- `generated_at`이 12시간 이내면 네트워크 없이 캐시를 사용합니다. TTL은 `TREND_RADAR_CACHE_TTL_HOURS`로 바꿀 수 있습니다.
- 갱신 중 인터넷, 검색, Reddit, 페이지 파싱 또는 분석이 실패하면 오래된 유효 캐시를 먼저 사용합니다.
- 캐시도 없으면 `getBestTrendForAccount`는 예외 대신 `{ ok: false, fallback: true }`를 반환합니다.
- 기존 `preflight`는 이 결과를 `trend_radar` 필드에 넣습니다. 실패 시 기존 `idea_guidance`, 게시 이력, Insights 기반 기획이 그대로 유지됩니다.

## 공개 인터페이스

```js
import { getBestTrendForAccount } from "./trend-radar/index.mjs";

const result = await getBestTrendForAccount("kongi");
if (result.ok) {
  console.log(result.concept);
}
```

실제 사용 확정 시에만 `{ recordSelection: true }`를 전달해 선택 이력을 기록합니다. 단순 preflight 추천은 사용한 것으로 기록하지 않습니다.
