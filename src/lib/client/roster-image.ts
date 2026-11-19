import type { RosterShareData } from "@/lib/employees/roster-share";

export async function rosterImage(data:RosterShareData):Promise<Blob>{
  await document.fonts?.ready;
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");if(!ctx)throw Error("تعذر تجهيز صورة الجدول.");
  const width=1500,pad=52,dayWidth=244,columnWidth=(width-pad*2-dayWidth)/2;
  ctx.font="28px Tahoma, Arial";
  const wrap=(text:string)=>{const lines:string[]=[];let line="";for(const word of text.split(/\s+/)){const next=line?line+" "+word:word;if(line&&ctx.measureText(next).width>columnWidth-46){lines.push(line);line=word;}else line=next;}lines.push(line);return lines;};
  const rows=data.rows.map(row=>({...row,m:wrap(row.morning),e:wrap(row.evening)}));
  const heights=rows.map(row=>Math.max(106,Math.max(row.m.length,row.e.length)*42+36));
  canvas.width=width;canvas.height=300+heights.reduce((sum,h)=>sum+h,0)+52;
  if(canvas.height>20000)throw Error("عدد أسماء الجدول أكبر من الحد المتاح للصورة.");
  ctx.direction="rtl";ctx.textAlign="right";ctx.fillStyle="#f1f6fc";ctx.fillRect(0,0,width,canvas.height);
  ctx.fillStyle="#123150";ctx.font="bold 38px Tahoma, Arial";ctx.fillText("محطة الفنار",width-pad,72);
  ctx.textAlign="left";ctx.font="bold 38px Tahoma, Arial";ctx.fillText("جدول الدوام الأسبوعي",pad,72);
  ctx.textAlign="center";ctx.font="26px Tahoma, Arial";ctx.fillText(data.range,width/2,128);
  const left=pad,right=width-pad,xDay=right-dayWidth/2,xMorning=right-dayWidth-columnWidth/2,xEvening=left+columnWidth/2;
  for(const [x,w,color] of [[left,columnWidth,"#19468e"],[left+columnWidth,columnWidth,"#009ca6"],[right-dayWidth,dayWidth,"#0861df"]] as const){ctx.fillStyle=color;ctx.fillRect(x,170,w,126);}
  ctx.fillStyle="#ffffff";ctx.font="bold 31px Tahoma, Arial";ctx.fillText("اليوم والتاريخ",xDay,240);ctx.fillText("الصباحي",xMorning,219);ctx.fillText("المسائي",xEvening,219);
  ctx.font="23px Tahoma, Arial";ctx.fillText(data.morning,xMorning,266,columnWidth-28);ctx.fillText(data.evening,xEvening,266,columnWidth-28);
  let y=296;
  rows.forEach((row,index)=>{const height=heights[index];ctx.fillStyle=index%2?"#eef5ff":"#ffffff";ctx.fillRect(left,y,right-left,height);ctx.strokeStyle="#cfdfef";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,y+height);ctx.lineTo(right,y+height);ctx.stroke();ctx.fillStyle="#123150";ctx.font="bold 29px Tahoma, Arial";ctx.fillText(row.day,xDay,y+height/2-5);ctx.font="25px Tahoma, Arial";ctx.fillText(row.dateLabel,xDay,y+height/2+30);ctx.font="28px Tahoma, Arial";for(const [lines,x] of [[row.m,xMorning],[row.e,xEvening]] as const)lines.forEach((line,i)=>ctx.fillText(line,x,y+(height-lines.length*42)/2+32+i*42,columnWidth-32));y+=height;});
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("تعذر تجهيز صورة الجدول.")),"image/png"));
}
