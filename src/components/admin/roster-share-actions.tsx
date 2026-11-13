"use client";
import { userMessage } from "@/lib/client/user-message";
import { useEffect,useState } from "react";
import type { RosterShareData } from "@/lib/employees/roster-share";
import styles from "./management.module.css";
function rosterImage(data:RosterShareData):Promise<Blob>{
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");if(!ctx)throw Error("CANVAS_UNAVAILABLE");
 const width=1500,pad=54,dayWidth=210,columnWidth=(width-pad*2-dayWidth)/2;
 ctx.font="28px Tahoma, Arial";
 const wrap=(value:string,max:number)=>{const lines:string[]=[];let line="";for(const word of value.split(/\s+/)){const next=line?line+" "+word:word;if(line&&ctx.measureText(next).width>max){lines.push(line);line=word;}else line=next;}lines.push(line);return lines;};
 const rows=data.rows.map(r=>({...r,a:wrap(r.morning,columnWidth-48),b:wrap(r.evening,columnWidth-48)}));
 const heights=rows.map(r=>Math.max(94,Math.max(r.a.length,r.b.length)*42+30));canvas.width=width;canvas.height=310+heights.reduce((a,b)=>a+b,0)+66;
 ctx.fillStyle="#eef5fc";ctx.fillRect(0,0,width,canvas.height);ctx.direction="rtl";ctx.textAlign="center";
 ctx.fillStyle="#123150";ctx.font="bold 46px Tahoma, Arial";ctx.fillText("محطة الفنار",width/2,83);ctx.font="bold 32px Tahoma, Arial";ctx.fillText("جدول الدوام الأسبوعي",width/2,140);
 const left=pad,right=width-pad,xDay=right-dayWidth/2,xMorning=right-dayWidth-columnWidth/2,xEvening=left+columnWidth/2;
 ctx.fillStyle="#1262d5";ctx.fillRect(left,183,width-pad*2,118);ctx.fillStyle="white";ctx.font="bold 30px Tahoma, Arial";ctx.fillText("اليوم",xDay,240);ctx.fillText("الصباحي",xMorning,225);ctx.fillText("المسائي",xEvening,225);ctx.font="24px Tahoma, Arial";ctx.fillText(data.morning,xMorning,269,columnWidth-25);ctx.fillText(data.evening,xEvening,269,columnWidth-25);
 let y=301;rows.forEach((row,index)=>{const h=heights[index];ctx.fillStyle=index%2?"#e4effc":"#ffffff";ctx.fillRect(left,y,width-pad*2,h);ctx.fillStyle="#123150";ctx.font="bold 28px Tahoma, Arial";ctx.fillText(row.day,xDay,y+h/2+10);ctx.font="28px Tahoma, Arial";for(const [lines,x] of [[row.a,xMorning],[row.b,xEvening]] as const)lines.forEach((line,i)=>ctx.fillText(line,x,y+(h-lines.length*42)/2+32+i*42,columnWidth-32));y+=h;});ctx.font="22px Tahoma, Arial";ctx.fillStyle="#5a718b";ctx.fillText("أوقات الدوام بتوقيت عمّان",width/2,y+44);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("IMAGE_FAILED")),"image/png"));
}
export function RosterShareActions({data}:{data:RosterShareData}){
 const [image,setImage]=useState<{data:RosterShareData;file:File;url:string}|null>(null),[error,setError]=useState("");
 useEffect(()=>{let alive=true,url:string|undefined;rosterImage(data).then(blob=>{if(!alive)return;url=URL.createObjectURL(blob);setImage({data,file:new File([blob],"alfanar-weekly-roster.png",{type:"image/png"}),url});}).catch(()=>{if(alive)setError(userMessage("تعذر تجهيز الصورة. يمكنك مشاركة الجدول كنص."));});return()=>{alive=false;if(url)URL.revokeObjectURL(url);};},[data]);
 const current=image?.data===data?image:null;
 async function share(){if(!current)return;setError("");try{if(navigator.canShare?.({files:[current.file]})&&navigator.share)await navigator.share({files:[current.file],title:"جدول دوام محطة الفنار"});else setError(userMessage("مشاركة الصور غير مدعومة هنا؛ استخدم تنزيل صورة أو واتساب كنص."));}catch(e){if(!(e instanceof DOMException&&e.name==="AbortError"))setError(userMessage("تعذرت المشاركة. استخدم تنزيل صورة أو واتساب كنص."));}}
 return <><div className={styles.actions}><a className={styles.primary} href={"https://wa.me/?text="+encodeURIComponent(data.text)} target="_blank" rel="noopener noreferrer">واتساب — نص</a><button type="button" disabled={!current} onClick={()=>void share()}>مشاركة صورة</button>{current&&<a href={current.url} download="alfanar-weekly-roster.png">تنزيل صورة</a>}</div>{error&&<p role="status">{error}</p>}</>;
}
