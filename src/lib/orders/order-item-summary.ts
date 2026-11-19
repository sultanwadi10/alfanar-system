type Item={name:string;quantity:number;category?:string;bottleOrigin?:string|null;origin?:string|null;bottleSizeMl?:number;saleUnit?:string};
function count(n:number,singular:string,dual:string,plural:string){return n===1?singular:n===2?dual:`${n} ${n>=3&&n<=10?plural:singular}`;}
export function orderItemSummary(item:Item):string{
  const origin=item.bottleOrigin??item.origin;
  if(item.category==="REFILL"||/^تعبئة/.test(item.name)){
    const kind=origin==="SAUDI"?"سعودي":origin==="JORDANIAN"?"أردني":"";
    const size=item.bottleSizeMl?`${item.bottleSizeMl/1000} لتر`:item.name.match(/\d+(?:[.,]\d+)?\s*(?:لتر|مل)/)?.[0]??"";
    return [count(item.quantity,"قارورة","قارورتان","قوارير"),kind,size].filter(Boolean).join(" ");
  }
  const unit=item.saleUnit?.trim();
  if(unit&&unit!=="وحدة"&&unit!=="قطعة"){
    const forms:Record<string,[string,string,string]>={"كرتونة":["كرتونة","كرتونتان","كراتين"],"كرتون":["كرتونة","كرتونتان","كراتين"],"قارورة":["قارورة","قارورتان","قوارير"],"شرنك":["شرنك","شرنكان","شرنكات"],"دفتر":["دفتر","دفتران","دفاتر"]};
    const counted=forms[unit]?count(item.quantity,...forms[unit]):`${item.quantity} ${unit}`;
    const name=item.name.startsWith(unit+" ")?item.name.slice(unit.length+1):item.name.replace(/^(?:كرتونة|كرتون)\s+/,"");
    return `${counted} ${name}`;
  }
  if(item.category==="NEW_BOTTLE")return `${count(item.quantity,"قارورة","قارورتان","قوارير")} ${item.name.replace(/^قارورة\s+/,"")}`;
  return `${item.quantity} × ${item.name}`;
}
