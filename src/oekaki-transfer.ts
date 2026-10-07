export function acceptsDrawingMessage(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, source: Window | null, origin: string, session: string): boolean {
  return !!source && event.origin === origin && event.source === source && event.data?.session === session && event.data?.type === 'oekaki-complete';
}
export async function drawingFile(blob: unknown): Promise<File> {
  if (!(blob instanceof Blob) || blob.type !== 'image/png' || blob.size < 24 || blob.size > 10 * 1024 * 1024) throw new Error('올바른 PNG 그림을 보내 주세요.');
  const header = new Uint8Array(await blob.slice(0,24).arrayBuffer());
  if (![137,80,78,71,13,10,26,10].every((v,i)=>header[i]===v) || String.fromCharCode(...header.slice(12,16)) !== 'IHDR') throw new Error('PNG 형식을 확인할 수 없어요.');
  const view = new DataView(header.buffer); const width=view.getUint32(16), height=view.getUint32(20);
  if (width < 1 || height < 1 || width > 1600 || height > 1600) throw new Error('그림 크기가 너무 커요.');
  return new File([blob],`oekaki-${new Date().toISOString().slice(0,10)}.png`,{type:'image/png'});
}
