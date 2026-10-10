import { useState } from 'react';
import type { Post } from './types';

export function PatchHistory({ posts, loading, onManage }: {
  posts: Post[]; loading: boolean; onManage?: () => void;
}) {
  const [showOlder, setShowOlder] = useState(false);
  const entries = posts.filter(p => p.kind === 'update' && p.status === 'public')
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const visible = showOlder ? entries : entries.slice(0, 5);
  return <section className="patch-history" aria-labelledby="patch-heading">
    <div className="section-head">
      <div><div className="eyebrow">UPDATE LOG</div><h2 id="patch-heading">작은 변화의 기록</h2></div>
      {onManage && <button onClick={onManage}>패치 이력 관리</button>}
    </div>
    <p className="hint">홈페이지에 새로 생긴 것들과 고친 부분을 남겨요.</p>
    {loading ? <p role="status">패치 이력을 불러오는 중…</p> : entries.length ? <>
      <div className="patch-list" id="patch-entries">
        {visible.map((post, index) => <details className="patch-entry" key={post.id} open={index === 0 ? true : undefined}>
          <summary><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit'})}</time><span>{post.title}</span></summary>
          <div className="patch-body">{post.body}</div>
        </details>)}
      </div>
      {entries.length > 5 && <button className="patch-more" aria-expanded={showOlder} aria-controls="patch-entries" onClick={() => setShowOlder(v => !v)}>{showOlder ? '최근 5개만 보기' : `이전 기록 더 보기 (${entries.length - 5})`}</button>}
    </> : <div className="empty">아직 등록된 패치 이력이 없어요.</div>}
  </section>;
}
