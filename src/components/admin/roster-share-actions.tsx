"use client";
import { useEffect,useRef,useState } from "react";
import type { RosterShareData } from "@/lib/employees/roster-share";
import { rosterImage } from "@/lib/client/roster-image";
import { shareRosterImage,shareRosterText } from "@/lib/client/share-roster";
import { AlfanarIcon } from "./alfanar-icon";
import styles from "./roster-share-actions.module.css";
export function RosterShareActions({data,disabled=false}:{data:RosterShareData;disabled?:boolean}){
  const [image,setImage]=useState<{data:RosterShareData;file:File}|null>(null),[feedback,setFeedback]=useState<{data:RosterShareData;text:string}|null>(null),[busy,setBusy]=useState(false),working=useRef(false);
  useEffect(()=>{let active=true;rosterImage(data).then(blob=>{if(active)setImage({data,file:new File([blob],`alfanar-roster-${data.weekStart}.png`,{type:"image/png"})});}).catch(error=>{if(active)setFeedback({data,text:error instanceof Error?error.message:"تعذر تجهيز الصورة."});});return()=>{active=false;};},[data]);
  async function share(kind:"text"|"image"){
    if(working.current||disabled||kind==="image"&&image?.data!==data)return;working.current=true;setBusy(true);
    try{const result=kind==="text"?await shareRosterText(data.text):await shareRosterImage(image!.file);setFeedback({data,text:result==="COPIED"?(kind==="text"?"تم نسخ النص":"تم نسخ الصورة"):result==="SHARED"?"تمت المشاركة":""});}catch(error){setFeedback({data,text:error instanceof Error?error.message:"تعذرت المشاركة."});}finally{working.current=false;setBusy(false);}
  }
  return <div className={styles.actions}><button type="button" disabled={disabled||busy} onClick={()=>void share("text")}><AlfanarIcon name="file"/>مشاركة نص</button><button type="button" disabled={disabled||busy||image?.data!==data} onClick={()=>void share("image")}><AlfanarIcon name="image"/>مشاركة صورة</button>{feedback?.data===data&&feedback.text&&<span className={styles.message} role="status">{feedback.text}</span>}</div>;
}
