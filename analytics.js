/*
Google Analytics 4 loader.
측정 ID는 prompts.js의 SITE_CONFIG.analyticsMeasurementId에서 관리합니다.
*/

(() => {
  const measurementId = typeof SITE_CONFIG !== "undefined"
    ? String(SITE_CONFIG.analyticsMeasurementId || "").trim()
    : "";

  // GA가 설정되지 않아도 사이트 기능은 정상 동작하도록 빈 함수를 먼저 제공합니다.
  window.trackEvent = () => {};
  window.analyticsReady = false;

  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
    console.info("GA4 측정 ID가 없어 방문 통계를 전송하지 않습니다.");
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false
  });

  const tag = document.createElement("script");
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(tag);

  window.trackEvent = (eventName, parameters = {}) => {
    if (!eventName || typeof eventName !== "string") return;

    const cleanParameters = {};
    Object.entries(parameters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      cleanParameters[key] = typeof value === "string" ? value.slice(0, 100) : value;
    });

    window.gtag("event", eventName, cleanParameters);
  };

  window.analyticsReady = true;
})();
