'use strict';
// Trusted local tool: accept only the embedding homepage, on the same origin.
(() => {
  const button = document.getElementById('post-drawing');
  let session = '', pending = false, timer;
  function ready() { parent.postMessage({ type: 'oekaki-ready', session }, location.origin); }
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== parent || parent === window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'oekaki-init' && typeof data.session === 'string' && data.session.length <= 80) {
      await window.oekakiReady;
      session = data.session; button.disabled = false; ready();
    }
    if (data.type === 'oekaki-result' && data.session === session && pending) {
      clearTimeout(timer); pending = false; button.disabled = false;
      toast(data.ok ? '그림을 글쓰기 화면에 첨부했어요.' : '전송에 실패했어요. 다시 누르거나 PNG로 저장해 주세요.');
    }
  });
  button.onclick = async () => {
    if (!session || pending || drawing) return;
    pending = true; button.disabled = true;
    composite(); saveLocal();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { pending = false; button.disabled = false; toast('그림 변환 실패. PNG 저장을 다시 시도해 주세요.'); return; }
    parent.postMessage({ type: 'oekaki-complete', session, blob }, location.origin);
    timer = setTimeout(() => { pending = false; button.disabled = false; toast('전송 응답이 없어요. 다시 누르거나 PNG로 저장해 주세요.'); }, 10000);
  };
})();
