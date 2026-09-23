(function () {
  'use strict';
  if (window.__cwLocalAdHiderInstalled) return;
  window.__cwLocalAdHiderInstalled = true;

  // Hide only Chatwork's promotion banner; leave its paid "Hide ads" control alone.
  const adSelector = '#_upgradePromotionContainer';
  const thirdPartyAdSelectors = [
    'iframe[id^="google_ads_iframe"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    '[id^="google_ads_iframe"]',
    '[id*="adContainer" i]',
    '[class*="ad-container" i]'
  ].join(',');
  const upgradeText = /^(?:paid plan required|available on paid plans?|付費方案可使用|付费方案可使用|有料プランで利用可能|유료 플랜에서 사용 가능)$/i;
  function hidePromotion() {
    // Hide third-party ad slots served inside Chatwork, including Google ads.
    for (const ad of document.querySelectorAll(thirdPartyAdSelectors)) {
      let slot = ad;
      let parent = ad.parentElement;
      for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) {
        const rect = parent.getBoundingClientRect();
        if (rect.width >= 200 && rect.height >= 100 && rect.width <= 1200 && rect.height <= 1000) {
          slot = parent;
          break;
        }
      }
      if (slot.style.getPropertyValue('display') !== 'none' ||
          slot.style.getPropertyPriority('display') !== 'important') {
        slot.style.setProperty('display', 'none', 'important');
      }
    }

    const promotion = document.querySelector(adSelector);
    if (promotion && (promotion.style.getPropertyValue('display') !== 'none' ||
        promotion.style.getPropertyPriority('display') !== 'important')) {
      promotion.style.setProperty('display', 'none', 'important');
    }

    // Chatwork also renders a separate paid-plan upsell card inside its AI panel.
    for (const label of document.querySelectorAll('p')) {
      if (!upgradeText.test((label.textContent || '').replace(/\s+/g, ' ').trim())) continue;
      let card = label;
      for (let depth = 0; card && depth < 4; depth++, card = card.parentElement) {
        if (card.dataset.cwAdHidden === 'true') {
          if (card.style.getPropertyValue('display') !== 'none' ||
              card.style.getPropertyPriority('display') !== 'important') {
            card.style.setProperty('display', 'none', 'important');
          }
          break;
        }
        const rect = card.getBoundingClientRect();
        if (rect.width >= 200 && rect.width <= 500 && rect.height >= 40 && rect.height <= 180) {
          card.dataset.cwAdHidden = 'true';
          card.style.setProperty('display', 'none', 'important');
          break;
        }
      }
    }
  }

  let scheduled = false;
  function scheduleHide() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      hidePromotion();
    });
  }

  hidePromotion();
  new MutationObserver(scheduleHide).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden']
  });
})();
