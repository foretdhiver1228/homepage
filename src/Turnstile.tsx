import { useEffect, useRef, useState } from 'react';

type WidgetAPI = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: WidgetAPI } }
let loading: Promise<WidgetAPI> | undefined;
function loadWidget(): Promise<WidgetAPI> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const timer = window.setTimeout(() => failed(), 15000);
    function failed() {
      window.clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(new Error('방문자 확인을 불러오지 못했어요. 페이지를 새로고침해 주세요.'));
    }
    script.onerror = failed;
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile); else failed();
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function Turnstile({ action, reset, onToken }: {
  action: 'guestbook_create' | 'guestbook_read' | 'owner_login'; reset: number; onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [error, setError] = useState('');
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  useEffect(() => {
    let active = true;
    let api: WidgetAPI | undefined;
    let widget: string | undefined;
    callback.current('');
    setError('');
    if (!sitekey) { setError('방문자 확인 설정이 필요해요. 집주인에게 알려주세요.'); return; }
    void loadWidget().then(loaded => {
      if (!active || !container.current) return;
      api = loaded;
      widget = api.render(container.current, {
        sitekey, action, size: 'flexible', theme: 'light', language: 'ko',
        'response-field': false,
        callback: (token: string) => { if (active) { setError(''); callback.current(token); } },
        'expired-callback': () => { if (active) callback.current(''); },
        'error-callback': () => {
          if (active) { callback.current(''); setError('방문자 확인에 실패했어요. 잠시 후 다시 시도하거나 새로고침해 주세요.'); }
        },
      });
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : '방문자 확인에 실패했어요.');
    });
    return () => { active = false; if (api && widget !== undefined) api.remove(widget); };
  }, [action, reset, sitekey]);
  return <div className="visitor-check"><div ref={container}/>{error && <p className="error" role="alert">{error}</p>}</div>;
}
