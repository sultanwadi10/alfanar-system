"use client";

import { useState } from "react";
import type { StockItem, StockKind } from "@/types/inventory";

export function StockItemFields({ item, defaultKind = "GOODS", gridClassName }: { item?: StockItem; defaultKind?: StockKind; gridClassName: string }) {
  const [kind, setKind] = useState<StockKind>(item?.kind ?? defaultKind);
  const [baseUnit, setBaseUnit] = useState(item?.baseUnit ?? "");
  const [packLabel, setPackLabel] = useState(item?.packLabel ?? "");
  const [packCount, setPackCount] = useState(String(item?.unitsPerPack ?? 1));
  return <>

    <div className={gridClassName}>
      <label>اسم الصنف<input name="name" required minLength={2} maxLength={160} defaultValue={item?.name} placeholder="قارورة مستعملة سعودي 20 لتر"/></label>
      <label>تصنيف الاستخدام<select name="kind" value={kind} onChange={event => setKind(event.target.value as StockKind)}><option value="GOODS">بضاعة للبيع</option><option value="CONSUMABLE">مواد تشغيلية تُستهلك في العمل</option><option value="BOTTLE_POOL">قوارير توزيع مستعملة تُسترد من العميل</option></select></label>
      <label>الشركة / العلامة<input name="brand" maxLength={80} defaultValue={item?.brand} placeholder="اسم الشركة المصنعة، أو اتركه فارغًا"/></label>
      <label>الحجم والموديل / المواصفات<input name="size" maxLength={80} defaultValue={item?.size} placeholder="20 لتر — كريستال، أو 200 مل"/></label>
      <label>الوحدة الأساسية للعد<input name="baseUnit" required minLength={2} maxLength={160} value={baseUnit} onChange={event => setBaseUnit(event.target.value)} placeholder="قارورة / كوب / عبوة / غطاء / غرام"/></label>
      <label>اسم عبوة الشراء<input name="packLabel" required minLength={2} maxLength={160} value={packLabel} onChange={event => setPackLabel(event.target.value)} placeholder="قارورة / كرتونة / شرنك / كيس"/></label>
      <label>عدد الوحدات الأساسية داخل عبوة واحدة<input name="unitsPerPack" type="number" min={1} max={1000000} required value={packCount} onChange={event => setPackCount(event.target.value)} lang="en-GB"/></label>
      <label>أصل القارورة — للجديدة والمستعملة<select name="origin" defaultValue={item?.origin ?? "DEFAULT"}><option value="DEFAULT">لا ينطبق / نوع بدون فصل بالأصل</option><option value="JORDANIAN">أردني</option><option value="SAUDI">سعودي</option></select></label>
      <label>حد التنبيه — بعدد الوحدات الأساسية<input name="lowStock" type="number" min={0} max={1000000000} required defaultValue={item?.lowStock ?? 0} lang="en-GB"/></label>
    </div>
    {item && <input type="hidden" name="reason" value="تسجيل إجراء من الإدارة"/>}
  </>;
}
