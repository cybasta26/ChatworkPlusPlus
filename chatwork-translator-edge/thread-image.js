(() => {
  const check = signal => { if (signal?.aborted) throw new DOMException('Export canceled','AbortError'); };
  function dimensions(width,height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error(CW_I18N.t('thread_image_failed'));
    // Keep both canvas dimensions and memory bounded; never silently crop the bottom.
    const scale = Math.min(2,30000/height,30000/width,Math.sqrt(48000000/(width*height)));
    if (scale < .5) throw new Error(CW_I18N.t('thread_image_large'));
    return {width:Math.ceil(width),height:Math.ceil(height),scale};
  }
  function snapshot(box) {
    const copy = box.cloneNode(true); copy.removeAttribute('id'); copy.classList.add('cw-m-export-capture');
    copy.setAttribute('aria-hidden','true');
    // Content-script CSS is not a page stylesheet and may be absent from the
    // renderer's iframe. Freeze the rendered styles before expanding the copy.
    const originals = [box,...box.querySelectorAll('*')];
    [copy,...copy.querySelectorAll('*')].forEach((element,index) => {
      const style = getComputedStyle(originals[index]);
      for (let i=0;i<style.length;i++) {
        const property = style[i];
        if (!property.startsWith('--')) element.style.setProperty(property,style.getPropertyValue(property));
      }
      // Let text and cards reflow after removing controls and the scrollbar.
      if (element.tagName !== 'IMG') for (const property of ['width','height','min-width','min-height','max-width','max-height','inline-size','block-size','min-inline-size','min-block-size','max-inline-size','max-block-size']) element.style.removeProperty(property);
    });
    copy.querySelectorAll('button,input,select,.cw-m-thread-resize,.cw-m-thread-view-toggle,.cw-m-thread-export,.cw-m-thread-export-status').forEach(el => el.remove());
    const sources = box.querySelectorAll('.cw-m-thread-source');
    copy.querySelectorAll('.cw-m-thread-source').forEach((el,index) => {
      if (getComputedStyle(sources[index]).display === 'none') el.style.display = 'none';
    });
    const width = Math.max(260,Math.round(box.getBoundingClientRect().width));
    copy.style.cssText += `position:absolute!important;left:-100000px!important;top:0!important;right:auto!important;bottom:auto!important;width:${width}px!important;height:auto!important;max-height:none!important;display:block!important;overflow:visible!important;pointer-events:none!important;box-shadow:none!important;z-index:-1!important;`;
    const list = copy.querySelector('.cw-m-thread-list');
    list.style.cssText += 'height:auto!important;max-height:none!important;overflow:visible!important;display:block!important;flex:none!important;';
    copy.querySelectorAll('.cw-m-thread-message').forEach(el => { el.style.breakInside = 'avoid'; });
    document.body.append(copy);
    return copy;
  }
  async function capture(box,{signal}={}) {
    check(signal);
    if (!box.isConnected || typeof globalThis.html2canvas !== 'function') throw new Error(CW_I18N.t('thread_image_failed'));
    const copy = snapshot(box);
    let canvas;
    try {
      await new Promise(resolve => requestAnimationFrame(resolve)); check(signal);
      const rect = copy.getBoundingClientRect();
      const size = dimensions(rect.width,Math.max(rect.height,copy.scrollHeight));
      canvas = await html2canvas(copy,{...size,backgroundColor:'#f5f9fa',logging:false,useCORS:true,allowTaint:false,imageTimeout:5000,
        // Clone only the export surface, not the rest of the private chat UI.
        ignoreElements:el => el.parentElement === document.body && el !== copy,
        onclone:doc => {
          const root = doc.querySelector('.cw-m-export-capture');
          root.style.setProperty('left','0','important'); root.style.setProperty('top','0','important');
        },scrollX:0,scrollY:0,windowWidth:Math.max(innerWidth,size.width),windowHeight:innerHeight});
      check(signal);
      const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(CW_I18N.t('thread_image_failed'))),'image/png'));
      check(signal); return blob;
    } finally { copy.remove(); if (canvas) { canvas.width=0; canvas.height=0; } }
  }
  function copy(blobPromise) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error(CW_I18N.t('thread_image_clipboard_failed'));
    // Invoke during the click gesture; the PNG may take time to render.
    return navigator.clipboard.write([new ClipboardItem({'image/png':blobPromise})]);
  }
  function save(blob,filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href=url; link.download=filename; link.hidden=true; document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url),60000); }
  }
  globalThis.ThreadImageExport = {capture,copy,save,dimensions,snapshot};
})();
