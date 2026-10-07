const encoder = new TextEncoder();
export const PASSWORD_ITERATIONS = 600000;
export function base64(bytes: Uint8Array): string { return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')); }
export function fromBase64(text: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(text),c=>c.charCodeAt(0)); }
export function constantTimeEqual(a: Uint8Array,b: Uint8Array): boolean {
  if(a.length!==b.length)return false;
  let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];return different===0;
}
export async function passwordHash(password: string,salt?: string,iterations=PASSWORD_ITERATIONS) {
  if(iterations<600000||iterations>1000000)throw new Error('Unsupported password work factor');
  const saltBytes=salt?fromBase64(salt):crypto.getRandomValues(new Uint8Array(16));
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBytes,iterations},material,256);
  return {hash:base64(new Uint8Array(bits)),salt:base64(saltBytes),iterations};
}
export async function verifyPassword(password:string,hash:string,salt:string,iterations:number) {
  const derived=await passwordHash(password,salt,iterations);
  return constantTimeEqual(fromBase64(derived.hash),fromBase64(hash));
}
async function aesKey(secret:string) {
  const raw=fromBase64(secret);if(raw.length!==32)throw new Error('HOME_ENCRYPTION_KEY must contain exactly 32 bytes');
  return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function encryptPayload(payload:{body:string;reply:string|null},id:string,secret:string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`guestbook:v1:${id}`),tagLength:128},await aesKey(secret),encoder.encode(JSON.stringify(payload)));
  return {encrypted_payload:base64(new Uint8Array(cipher)),nonce:base64(iv),encryption_version:1};
}
export async function decryptPayload(row:{id:string;encrypted_payload:string;nonce:string;encryption_version:number},secret:string):Promise<{body:string;reply:string|null}> {
  if(row.encryption_version!==1)throw new Error('Unsupported encryption version');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(row.nonce),additionalData:encoder.encode(`guestbook:v1:${row.id}`),tagLength:128},await aesKey(secret),fromBase64(row.encrypted_payload));
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function ipFingerprint(ip:string,secret:string) {
  const key=await crypto.subtle.importKey('raw',fromBase64(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return base64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`guestbook-rate:v1:${ip}`))));
}
