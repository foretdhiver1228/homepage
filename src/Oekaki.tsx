import { useEffect, useRef, useState } from 'react';
import { acceptsDrawingMessage, drawingFile } from './oekaki-transfer';
export function Oekaki({onComplete,onClose}:{onComplete:(file:File)=>void;onClose:()=>void}) {
  const frame=useRef<HTMLIFrameElement>(null);const dialog=useRef<HTMLDialogElement>(null);
  const [session]=useState(()=>crypto.randomUUID());const [error,setError]=useState('');const [ready,setReady]=useState(false);
  const receiving=useRef(false);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.showModal();
    return()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  useEffect(()=>{
    const listener=async(event:MessageEvent)=>{
      const source=frame.current?.contentWindow??null;
      if(!source||event.origin!==location.origin||event.source!==source||event.data?.session!==session)return;
      if(event.data.type==='oekaki-ready'){setReady(true);return;}
      if(!acceptsDrawingMessage(event,source,location.origin,session)||receiving.current)return;
      receiving.current=true;
      try{const file=await drawingFile(event.data.blob);source.postMessage({type:'oekaki-result',session,ok:true},location.origin);onComplete(file);}
      catch(e){setError(e instanceof Error?e.message:'그림을 가져오지 못했어요.');source.postMessage({type:'oekaki-result',session,ok:false},location.origin);receiving.current=false;}
    };
    window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);
  },[session,onComplete]);
  function close(){if(window.confirm('그림방을 닫을까요? 그림은 이 브라우저에 임시 저장됩니다. 중요한 그림은 PNG로도 저장해 주세요.'))onClose();}
  return <dialog ref={dialog} className="oekaki-dialog" aria-labelledby="oekaki-title" onCancel={e=>{e.preventDefault();close();}}><div className="oekaki-head"><div><h2 id="oekaki-title">✎ 작은 그림방</h2><p>{ready?'완성 → 글쓰기 버튼을 누르면 그림이 첨부돼요.':'그림방을 여는 중…'}</p></div><button autoFocus onClick={close}>닫기</button></div>{error&&<p className="error" role="alert">{error}</p>}<iframe ref={frame} src="./oekaki/index.html" title="오에카키 그리기 도구" onLoad={()=>frame.current?.contentWindow?.postMessage({type:'oekaki-init',session},location.origin)}/></dialog>;
}
