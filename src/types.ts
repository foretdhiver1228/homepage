export type Kind = 'diary' | 'novel' | 'art' | 'update';
export type Status = 'draft' | 'public' | 'private';
export type Post = { id: string; kind: Kind; title: string; body: string; tags: string[]; status: Status; series_title: string | null; chapter_no: number | null; image_path: string | null; created_at: string; updated_at: string };
export type PostInput = Omit<Post, 'id' | 'created_at' | 'updated_at'>;
