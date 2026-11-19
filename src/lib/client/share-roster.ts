export type ShareResult="SHARED"|"COPIED"|"CANCELLED";
export async function shareRosterText(text:string):Promise<ShareResult>{
  try{if(navigator.share){await navigator.share({title:"جدول دوام محطة الفنار",text});return "SHARED";}if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return "COPIED";}throw Error("مشاركة النص غير مدعومة في هذا المتصفح.");}catch(error){if(error instanceof DOMException&&error.name==="AbortError")return "CANCELLED";throw error;}
}
export async function shareRosterImage(file:File):Promise<ShareResult>{
  try{if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:"جدول دوام محطة الفنار",files:[file]});return "SHARED";}if(navigator.clipboard?.write&&typeof ClipboardItem!=="undefined"){await navigator.clipboard.write([new ClipboardItem({"image/png":file})]);return "COPIED";}throw Error("مشاركة الصور ونسخها غير مدعومين في هذا المتصفح.");}catch(error){if(error instanceof DOMException&&error.name==="AbortError")return "CANCELLED";throw error;}
}
